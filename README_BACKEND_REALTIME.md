# Backend Realtime & Payments Runbook

## Realtime WebSocket Hub
- Redis pub/sub fan-out hub at `app/websockets/hub.py`
- Channels:
  - `tournament:{id}`
  - `match:{id}`
- Endpoints:
  - `GET /api/v1/ws/tournament/{id}`
  - `GET /api/v1/ws/match/{id}`
- Heartbeat: server sends PING every 25s; idle connections (>90s) are dropped.
- Message schema: unchanged; messages are forwarded as-is to subscribed clients.

Startup/shutdown handled in `app/main.py` lifespan.

## Payments (Kaspi-only)
- Initiate: `POST /api/v1/payments/initiate` returns only Kaspi QR payload.
- Health: `GET /api/v1/payments/health` reports queue depth and last success.
- Background worker: in-memory polling reconciler with jitter in `app/services/payment_service.py`.

## Observability
- Prometheus metrics: `GET /api/v1/metrics`
  - `current_ws_connections`
  - `redis_pubsub_backlog`
  - `broadcast_latency_ms`
  - `ws_messages_published`
  - `ws_messages_broadcasted`

## Config
- `REDIS_URL` environment variable (defaults to `redis://localhost:6379/0`).
- `WS_PING_INTERVAL_SECONDS` (default 25), `WS_IDLE_TIMEOUT_SECONDS` (default 90).

## Local Dev
- Ensure Redis is running (docker-compose provides a service).
- Start API: `uvicorn app.main:app --reload`.