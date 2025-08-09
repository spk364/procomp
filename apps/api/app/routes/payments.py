from datetime import datetime
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.services.payment_service import get_kaspi_payment_service

router = APIRouter(prefix="/payments", tags=["payments"])


class PaymentInitiateRequest(BaseModel):
    participant_id: str
    amount: Decimal = Field(gt=0)
    currency: str = Field(default="KZT")


class KaspiQRResponse(BaseModel):
    payment_id: str
    payment_url: str
    qr_image_url: str
    expires_at: datetime
    amount: Decimal
    currency: str


@router.post("/initiate", response_model=KaspiQRResponse)
async def initiate_payment(req: PaymentInitiateRequest):
    # In a full implementation, validate participant ownership and amount in DB
    payment_id = req.participant_id  # use participant_id as id placeholder
    service = get_kaspi_payment_service()
    payload = await service.initiate(
        payment_id=payment_id,
        amount=req.amount,
        user_email="user@example.com",
        description=f"Participant {req.participant_id}"
    )
    return KaspiQRResponse(
        payment_id=payment_id,
        payment_url=payload["payment_url"],
        qr_image_url=payload["qr_code"],
        expires_at=datetime.fromisoformat(payload["expires_at"]),
        amount=req.amount,
        currency=req.currency,
    )


@router.get("/health")
async def payments_health():
    service = get_kaspi_payment_service()
    h = service.get_health()
    return {
        "queue_depth": h.queue_depth,
        "last_success": h.last_success.isoformat() if h.last_success else None,
        "status": "ok",
    }