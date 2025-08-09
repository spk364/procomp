"""
WebSocket routes for the tournament platform (hub-backed)
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from typing import Optional
import json
from datetime import datetime
import structlog

from app.websockets.match_websocket import websocket_endpoint, get_match_connection_stats
from app.dependencies import get_current_user_websocket
from app.websockets.hub import get_hub

logger = structlog.get_logger()

router = APIRouter()


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


@router.websocket("/ws/match/{match_id}")
async def match_websocket_endpoint(
    websocket: WebSocket,
    match_id: str,
    role: Optional[str] = Query(None, description="Role: 'referee' for control access, otherwise view-only"),
):
    """
    WebSocket endpoint for real-time match updates via Redis hub.
    Preserves existing message schema expected by referee/HUD clients.
    """
    hub = get_hub()
    await hub.start()

    channel = f"match:{match_id}"
    await hub.connect(websocket, channel)

    # Send initial connection status
    await websocket.send_text(
        json.dumps({
            "type": "CONNECTION_STATUS",
            "matchId": match_id,
            "data": {"connected": True},
            "timestamp": _now_iso(),
        })
    )

    try:
        while True:
            try:
                data = await websocket.receive_text()
                hub.mark_activity(websocket)
                raw = json.loads(data)
                msg_type = raw.get("type")

                # Heartbeat
                if msg_type in ("PING", "ping"):
                    await websocket.send_text(json.dumps({"type": "PONG", "timestamp": _now_iso()}))
                    continue

                # Fan-out control/state messages as-is to the channel
                # Keep compatibility with Zod parsers used by web
                await hub.publish(channel, raw)
            except WebSocketDisconnect:
                break
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"type": "ERROR", "error": "Invalid JSON", "timestamp": _now_iso()}))
            except Exception as e:
                logger.error("ws_match_loop_error", error=str(e))
                await websocket.send_text(json.dumps({"type": "ERROR", "error": "Internal error", "timestamp": _now_iso()}))
    finally:
        await hub.disconnect(websocket)


@router.websocket("/ws/tournament/{tournament_id}")
async def tournament_websocket_endpoint(
    websocket: WebSocket,
    tournament_id: str,
):
    """
    Tournament-level hub channel. Clients receive match/referee updates for a tournament.
    Message types expected by dashboard: match_update, referee_update, match_status_change, hud_status_change
    """
    hub = get_hub()
    await hub.start()

    channel = f"tournament:{tournament_id}"
    await hub.connect(websocket, channel)

    try:
        while True:
            try:
                data = await websocket.receive_text()
                hub.mark_activity(websocket)
                raw = json.loads(data)
                msg_type = raw.get("type")
                if msg_type in ("PING", "ping"):
                    await websocket.send_text(json.dumps({"type": "PONG", "timestamp": _now_iso()}))
                    continue
                # For tournament channel, forward subscribe/unsubscribe or other client intents as needed
                if msg_type == "subscribe":
                    # No-op: presence is managed by hub connect/disconnect
                    continue
                await hub.publish(channel, raw)
            except WebSocketDisconnect:
                break
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"type": "ERROR", "error": "Invalid JSON", "timestamp": _now_iso()}))
            except Exception as e:
                logger.error("ws_tournament_loop_error", error=str(e))
                await websocket.send_text(json.dumps({"type": "ERROR", "error": "Internal error", "timestamp": _now_iso()}))
    finally:
        await hub.disconnect(websocket) 