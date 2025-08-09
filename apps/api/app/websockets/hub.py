import asyncio
import json
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Dict, Set, Optional, Any

import structlog
from fastapi import WebSocket
from redis.asyncio import Redis
from redis.asyncio.client import PubSub

from app.core.config import get_settings

logger = structlog.get_logger()


@dataclass
class HubMetrics:
    current_ws_connections: int = 0
    messages_published: int = 0
    messages_broadcasted: int = 0
    last_broadcast_latency_ms: float = 0.0
    redis_pubsub_backlog: int = 0  # Best-effort; Redis doesn't expose per-channel backlog directly


class WebSocketHub:
    """Redis pub/sub fan-out hub for tournament and match channels.

    Channels:
      - tournament:{id}
      - match:{id}
    """

    def __init__(self, redis_url: Optional[str] = None):
        settings = get_settings()
        self.redis_url = redis_url or getattr(settings, "REDIS_URL", "redis://localhost:6379/0")
        self.ws_ping_interval_seconds = int(getattr(settings, "WS_PING_INTERVAL_SECONDS", 25))
        self.ws_idle_timeout_seconds = int(getattr(settings, "WS_IDLE_TIMEOUT_SECONDS", 90))

        self.redis: Optional[Redis] = None
        self.pubsub: Optional[PubSub] = None

        # channel -> set[WebSocket]
        self.channel_to_websockets: Dict[str, Set[WebSocket]] = defaultdict(set)
        # websocket -> last activity epoch seconds
        self.websocket_last_activity: Dict[WebSocket, float] = {}

        # channel subscription reference counts to manage subscribe/unsubscribe
        self._channel_local_counts: Dict[str, int] = defaultdict(int)

        # Background tasks
        self._listener_task: Optional[asyncio.Task] = None
        self._ping_task: Optional[asyncio.Task] = None

        self.metrics = HubMetrics()
        self._lock = asyncio.Lock()

    async def start(self):
        if self.redis is None:
            self.redis = Redis.from_url(self.redis_url, decode_responses=True)
            self.pubsub = self.redis.pubsub()
            self._listener_task = asyncio.create_task(self._listen_loop())
            self._ping_task = asyncio.create_task(self._ping_loop())
            logger.info("websocket_hub_started", redis_url=self.redis_url)

    async def stop(self):
        try:
            if self._listener_task and not self._listener_task.done():
                self._listener_task.cancel()
            if self._ping_task and not self._ping_task.done():
                self._ping_task.cancel()
            if self.pubsub:
                await self.pubsub.close()
            if self.redis:
                await self.redis.close()
        finally:
            self.redis = None
            self.pubsub = None
            self._listener_task = None
            self._ping_task = None
            logger.info("websocket_hub_stopped")

    def _channel_for_match(self, match_id: str) -> str:
        return f"match:{match_id}"

    def _channel_for_tournament(self, tournament_id: str) -> str:
        return f"tournament:{tournament_id}"

    async def connect(self, websocket: WebSocket, channel: str):
        await websocket.accept()
        now = time.time()
        async with self._lock:
            was_empty = self._channel_local_counts[channel] == 0
            self._channel_local_counts[channel] += 1
            self.channel_to_websockets[channel].add(websocket)
            self.websocket_last_activity[websocket] = now
            self.metrics.current_ws_connections = sum(len(v) for v in self.channel_to_websockets.values())

        if was_empty:
            await self._subscribe_channel(channel)
        logger.info("ws_connected", channel=channel, total_ws=self.metrics.current_ws_connections)

    async def disconnect(self, websocket: WebSocket):
        async with self._lock:
            channel_to_decrement: Optional[str] = None
            for ch, conns in list(self.channel_to_websockets.items()):
                if websocket in conns:
                    conns.discard(websocket)
                    self._channel_local_counts[ch] = max(0, self._channel_local_counts[ch] - 1)
                    if self._channel_local_counts[ch] == 0:
                        channel_to_decrement = ch
                    break
            self.websocket_last_activity.pop(websocket, None)
            self.metrics.current_ws_connections = sum(len(v) for v in self.channel_to_websockets.values())

        if channel_to_decrement:
            await self._unsubscribe_channel(channel_to_decrement)
        try:
            await websocket.close()
        except Exception:
            pass
        logger.info("ws_disconnected", total_ws=self.metrics.current_ws_connections)

    async def publish(self, channel: str, message: Dict[str, Any]):
        if self.redis is None:
            await self.start()
        payload = json.dumps(message)
        t0 = time.perf_counter()
        # Publish to Redis so all workers get it (including this one)
        await self.redis.publish(channel, payload)
        self.metrics.messages_published += 1
        # Optionally also broadcast locally immediately to reduce latency
        await self._broadcast_local(channel, payload)
        latency_ms = (time.perf_counter() - t0) * 1000.0
        self.metrics.last_broadcast_latency_ms = latency_ms

    async def _broadcast_local(self, channel: str, payload: str):
        conns = list(self.channel_to_websockets.get(channel, set()))
        if not conns:
            return
        disconnected: list[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_text(payload)
                self.metrics.messages_broadcasted += 1
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            await self.disconnect(ws)

    async def _subscribe_channel(self, channel: str):
        if not self.pubsub:
            return
        await self.pubsub.subscribe(channel)
        logger.info("hub_subscribed", channel=channel)

    async def _unsubscribe_channel(self, channel: str):
        if not self.pubsub:
            return
        try:
            await self.pubsub.unsubscribe(channel)
            logger.info("hub_unsubscribed", channel=channel)
        except Exception:
            logger.warning("hub_unsubscribe_failed", channel=channel)

    async def _listen_loop(self):
        # Continuously listen to Redis pub/sub and fan-out to local websockets
        assert self.pubsub is not None
        try:
            async for msg in self.pubsub.listen():
                # msg looks like {"type": "message", "pattern": None, "channel": "...", "data": "..."}
                if msg is None:
                    await asyncio.sleep(0.01)
                    continue
                if msg.get("type") != "message":
                    continue
                channel = msg.get("channel")
                data = msg.get("data")
                if channel and data:
                    await self._broadcast_local(channel, data)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("hub_listen_loop_error", error=str(e))
            await asyncio.sleep(0.5)
            # Attempt to restart listener
            if self.redis is not None:
                self.pubsub = self.redis.pubsub()
                self._listener_task = asyncio.create_task(self._listen_loop())

    async def _ping_loop(self):
        while True:
            try:
                await asyncio.sleep(self.ws_ping_interval_seconds)
                now = time.time()
                # Send ping and drop idle
                for ws, last in list(self.websocket_last_activity.items()):
                    idle = now - last
                    if idle > self.ws_idle_timeout_seconds:
                        await self.disconnect(ws)
                        continue
                    try:
                        await ws.send_text(json.dumps({"type": "PING", "ts": int(now)}))
                    except Exception:
                        await self.disconnect(ws)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning("hub_ping_loop_error", error=str(e))

    def mark_activity(self, websocket: WebSocket):
        self.websocket_last_activity[websocket] = time.time()

    # Expose metrics for /metrics endpoint
    def get_metrics(self) -> HubMetrics:
        return self.metrics


# Global hub singleton
_hub: Optional[WebSocketHub] = None


def get_hub() -> WebSocketHub:
    global _hub
    if _hub is None:
        _hub = WebSocketHub()
    return _hub