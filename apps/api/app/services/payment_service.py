import asyncio
import random
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional

import httpx
import structlog

logger = structlog.get_logger()


@dataclass
class PaymentsHealth:
    queue_depth: int = 0
    last_success: Optional[datetime] = None


class KaspiPaymentService:
    """Kaspi-only payment initiation and polling reconciliation."""

    def __init__(self):
        self.health = PaymentsHealth()
        # naive in-memory queue of pending payment_ids to reconcile
        self._pending_queue: list[str] = []
        self._poll_task: Optional[asyncio.Task] = None
        self._stop_event = asyncio.Event()

    async def start(self):
        if self._poll_task is None or self._poll_task.done():
            self._stop_event.clear()
            self._poll_task = asyncio.create_task(self._poll_loop())
            logger.info("kaspi_polling_worker_started")

    async def stop(self):
        self._stop_event.set()
        if self._poll_task and not self._poll_task.done():
            self._poll_task.cancel()
        self._poll_task = None
        logger.info("kaspi_polling_worker_stopped")

    async def initiate(self, payment_id: str, amount: Decimal, user_email: str, description: str) -> dict:
        # Mock Kaspi QR creation
        async with httpx.AsyncClient() as client:
            try:
                expires_at = datetime.utcnow() + timedelta(minutes=30)
                payload = {
                    "payment_url": f"https://kaspi.kz/pay/{payment_id}",
                    "qr_code": f"https://kaspi.kz/qr/{payment_id}.png",
                    "transaction_id": f"kaspi_{payment_id[:8]}",
                    "expires_at": expires_at.isoformat(),
                }
                # Enqueue for reconciliation
                self._pending_queue.append(payment_id)
                self.health.queue_depth = len(self._pending_queue)
                logger.info("kaspi_payment_initiated", payment_id=payment_id, amount=str(amount))
                return payload
            except httpx.HTTPError as e:
                logger.error("kaspi_initiate_failed", error=str(e))
                raise

    async def _reconcile(self, payment_id: str) -> bool:
        # Mock polling result: randomly succeed to simulate external confirmation
        await asyncio.sleep(0.01)
        # 30% chance to mark as paid per attempt
        return random.random() < 0.3

    async def _poll_loop(self):
        base_interval = 10  # seconds
        while not self._stop_event.is_set():
            try:
                # jitter 0..5s
                interval = base_interval + random.uniform(0, 5)
                await asyncio.sleep(interval)
                if not self._pending_queue:
                    continue
                # Work a copy to avoid long locks; simple approach
                for payment_id in list(self._pending_queue):
                    try:
                        paid = await self._reconcile(payment_id)
                        if paid:
                            # In real implementation, update DB: set status paid, activate participant, etc.
                            self._pending_queue.remove(payment_id)
                            self.health.queue_depth = len(self._pending_queue)
                            self.health.last_success = datetime.utcnow()
                            logger.info("kaspi_payment_reconciled", payment_id=payment_id)
                    except Exception as e:
                        logger.error("kaspi_reconcile_error", payment_id=payment_id, error=str(e))
                        # keep in queue for retry
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("kaspi_poll_loop_error", error=str(e))

    def get_health(self) -> PaymentsHealth:
        return self.health


# Singleton accessor
_payment_service: Optional[KaspiPaymentService] = None


def get_kaspi_payment_service() -> KaspiPaymentService:
    global _payment_service
    if _payment_service is None:
        _payment_service = KaspiPaymentService()
    return _payment_service