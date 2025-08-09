import asyncio
import json
import types
import pytest

from apps.api.app.websockets.hub import WebSocketHub


class FakeWebSocket:
    def __init__(self):
        self.accepted = False
        self.closed = False
        self.sent = []

    async def accept(self):
        self.accepted = True

    async def close(self):
        self.closed = True

    async def send_text(self, data: str):
        self.sent.append(data)


@pytest.mark.asyncio
async def test_hub_local_broadcast(monkeypatch):
    hub = WebSocketHub(redis_url="redis://localhost:6379/0")
    # Avoid starting Redis for this unit test; monkeypatch publish to no-op
    async def fake_publish(channel, payload):
        return 1
    hub.redis = types.SimpleNamespace(publish=fake_publish)

    ws = FakeWebSocket()
    await hub.connect(ws, "match:test-1")

    msg = {"type": "TEST", "matchId": "test-1", "data": {"ok": True}}
    await hub.publish("match:test-1", msg)

    assert ws.sent, "Expected message to be sent locally"
    parsed = json.loads(ws.sent[-1])
    assert parsed["type"] == "TEST"
    assert parsed["data"]["ok"] is True

    await hub.disconnect(ws)