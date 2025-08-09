from fastapi import APIRouter, Response

from app.websockets.hub import get_hub
from app.services.payment_service import get_kaspi_payment_service

router = APIRouter(tags=["health"]) 


@router.get("/payments/health")
async def payments_health():
    service = get_kaspi_payment_service()
    h = service.get_health()
    return {
        "queue_depth": h.queue_depth,
        "last_success": h.last_success.isoformat() if h.last_success else None,
        "status": "ok",
    }


@router.get("/metrics")
async def metrics() -> Response:
    hub = get_hub()
    m = hub.get_metrics()

    lines = [
        "# HELP current_ws_connections Current WebSocket connections",
        "# TYPE current_ws_connections gauge",
        f"current_ws_connections {m.current_ws_connections}",
        "# HELP redis_pubsub_backlog Best-effort backlog indicator",
        "# TYPE redis_pubsub_backlog gauge",
        f"redis_pubsub_backlog {m.redis_pubsub_backlog}",
        "# HELP broadcast_latency_ms Last broadcast latency in ms",
        "# TYPE broadcast_latency_ms gauge",
        f"broadcast_latency_ms {m.last_broadcast_latency_ms}",
        "# HELP ws_messages_published Total messages published",
        "# TYPE ws_messages_published counter",
        f"ws_messages_published {m.messages_published}",
        "# HELP ws_messages_broadcasted Total messages broadcasted",
        "# TYPE ws_messages_broadcasted counter",
        f"ws_messages_broadcasted {m.messages_broadcasted}",
    ]

    body = "\n".join(lines) + "\n"
    return Response(content=body, media_type="text/plain; version=0.0.4")