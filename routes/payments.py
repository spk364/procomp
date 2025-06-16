"""
Payment Flow Routes for ProComp Tournament Platform

This module handles the complete payment flow for tournament registrations including:
- Kaspi QR payments (Kazakhstan)
- Apple Pay via Stripe
- Google Pay via Stripe

Author: ProComp Backend Team
"""

import hashlib
import hmac
import json
import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, List, Optional, Union
from uuid import uuid4

import httpx
import stripe
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, validator
from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

# Assuming these imports exist in your project structure
from app.core.config import get_settings
from app.core.database import get_db_session
from app.core.security import get_current_user
from app.models.database import Payment, Participant, Tournament, User
from app.models.enums import Currency, PaymentMethod, PaymentStatus, ParticipantStatus

# Setup
settings = get_settings()
stripe.api_key = settings.STRIPE_SECRET_KEY
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/payments", tags=["payments"])

# Constants
KASPI_QR_API_URL = "https://api.kaspi.kz/payments/qr"
KASPI_TIMEOUT_MINUTES = 30
STRIPE_WEBHOOK_TOLERANCE = 300  # 5 minutes


# ========================
# PYDANTIC MODELS
# ========================

class PaymentInitiateRequest(BaseModel):
    """Request model for initiating a payment"""
    participant_id: str = Field(..., description="ID of the participant making payment")
    method: PaymentMethod = Field(..., description="Payment method to use")
    amount: Decimal = Field(..., gt=0, description="Payment amount")
    currency: Currency = Field(default=Currency.USD, description="Payment currency")
    return_url: Optional[str] = Field(None, description="URL to redirect after payment")
    
    @validator('method')
    def validate_supported_methods(cls, v):
        supported = [PaymentMethod.KASPI_QR, PaymentMethod.APPLE_PAY, PaymentMethod.GOOGLE_PAY]
        if v not in supported:
            raise ValueError(f"Payment method {v} is not supported")
        return v


class KaspiQRResponse(BaseModel):
    """Response model for Kaspi QR payment"""
    payment_id: str
    payment_url: str
    qr_image_url: str
    expires_at: datetime
    amount: Decimal
    currency: str


class StripeWalletResponse(BaseModel):
    """Response model for Stripe wallet payments (Apple Pay / Google Pay)"""
    payment_id: str
    client_secret: str
    amount: Decimal
    currency: str


class PaymentStatusResponse(BaseModel):
    """Response model for payment status check"""
    payment_id: str
    participant_id: str
    status: PaymentStatus
    method: Optional[PaymentMethod]
    amount: Decimal
    currency: Currency
    created_at: datetime
    updated_at: datetime
    failure_reason: Optional[str] = None


class WebhookEvent(BaseModel):
    """Model for webhook event data"""
    type: str
    data: Dict


# ========================
# PAYMENT SERVICES
# ========================

class KaspiPaymentService:
    """Service for handling Kaspi QR payments"""
    
    def __init__(self):
        self.api_url = KASPI_QR_API_URL
        self.timeout = KASPI_TIMEOUT_MINUTES
    
    async def create_qr_payment(
        self, 
        payment_id: str, 
        amount: Decimal, 
        user_email: str,
        description: str
    ) -> Dict[str, str]:
        """
        Create a Kaspi QR payment request
        
        Note: This is a mock implementation since Kaspi API specifics aren't public.
        In production, you'd implement the actual Kaspi QR API integration.
        """
        async with httpx.AsyncClient() as client:
            try:
                payload = {
                    "amount": float(amount),
                    "currency": "KZT",
                    "description": description,
                    "order_id": payment_id,
                    "user_email": user_email,
                    "expires_in": self.timeout * 60,  # Convert to seconds
                }
                
                # Mock response for demo purposes
                # In production, replace with actual Kaspi API call
                response_data = {
                    "payment_url": f"https://kaspi.kz/pay/{payment_id}",
                    "qr_code": f"https://kaspi.kz/qr/{payment_id}.png",
                    "transaction_id": f"kaspi_{uuid4().hex[:8]}",
                    "expires_at": (datetime.utcnow() + timedelta(minutes=self.timeout)).isoformat()
                }
                
                logger.info(f"Created Kaspi QR payment: {payment_id}")
                return response_data
                
            except httpx.HTTPError as e:
                logger.error(f"Kaspi API error for payment {payment_id}: {e}")
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Kaspi payment service temporarily unavailable"
                )


class StripePaymentService:
    """Service for handling Stripe payments (Apple Pay / Google Pay)"""
    
    async def create_payment_intent(
        self,
        payment_id: str,
        amount: Decimal,
        currency: Currency,
        payment_method_types: List[str],
        metadata: Dict[str, str]
    ) -> stripe.PaymentIntent:
        """Create a Stripe PaymentIntent for wallet payments"""
        try:
            intent = stripe.PaymentIntent.create(
                amount=int(amount * 100),  # Convert to cents
                currency=currency.value.lower(),
                payment_method_types=payment_method_types,
                metadata={
                    "payment_id": payment_id,
                    **metadata
                },
                automatic_payment_methods={
                    "enabled": True,
                },
            )
            
            logger.info(f"Created Stripe PaymentIntent: {intent.id} for payment: {payment_id}")
            return intent
            
        except stripe.error.StripeError as e:
            logger.error(f"Stripe error for payment {payment_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Payment creation failed: {str(e)}"
            )


# ========================
# DATABASE SERVICES
# ========================

class PaymentDatabaseService:
    """Database operations for payments"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def get_participant_with_tournament(self, participant_id: str) -> Optional[Participant]:
        """Get participant with tournament and user data"""
        query = select(Participant).options(
            joinedload(Participant.tournament),
            joinedload(Participant.user)
        ).where(Participant.id == participant_id)
        
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def create_payment_record(
        self,
        participant_id: str,
        tournament_id: str,
        user_id: str,
        amount: Decimal,
        currency: Currency,
        method: PaymentMethod,
        **kwargs
    ) -> Payment:
        """Create a new payment record"""
        payment = Payment(
            amount=amount,
            currency=currency,
            status=PaymentStatus.PENDING,
            method=method,
            user_id=user_id,
            tournament_id=tournament_id,
            metadata={"participant_id": participant_id},
            **kwargs
        )
        
        self.db.add(payment)
        await self.db.commit()
        await self.db.refresh(payment)
        
        logger.info(f"Created payment record: {payment.id}")
        return payment
    
    async def get_payment_by_id(self, payment_id: str) -> Optional[Payment]:
        """Get payment by ID"""
        query = select(Payment).where(Payment.id == payment_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_payment_by_participant(self, participant_id: str) -> Optional[Payment]:
        """Get payment by participant ID"""
        query = select(Payment).where(
            Payment.metadata.contains({"participant_id": participant_id})
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def update_payment_status(
        self,
        payment_id: str,
        status: PaymentStatus,
        external_id: Optional[str] = None,
        failure_reason: Optional[str] = None
    ) -> bool:
        """Update payment status"""
        update_data = {"status": status, "updated_at": datetime.utcnow()}
        
        if external_id:
            update_data["stripe_payment_id"] = external_id
        if failure_reason:
            update_data["failure_reason"] = failure_reason
        
        query = update(Payment).where(Payment.id == payment_id).values(**update_data)
        result = await self.db.execute(query)
        await self.db.commit()
        
        return result.rowcount > 0
    
    async def activate_participant_on_payment(self, participant_id: str) -> bool:
        """Mark participant as paid and active"""
        query = update(Participant).where(
            Participant.id == participant_id
        ).values(
            status=ParticipantStatus.PAID,
            updated_at=datetime.utcnow()
        )
        
        result = await self.db.execute(query)
        await self.db.commit()
        
        logger.info(f"Activated participant: {participant_id}")
        return result.rowcount > 0


# ========================
# ROUTE HANDLERS
# ========================

@router.post("/initiate", response_model=Union[KaspiQRResponse, StripeWalletResponse])
async def initiate_payment(
    payment_request: PaymentInitiateRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Initiate a payment for tournament registration
    
    Supports:
    - Kaspi QR: Returns payment URL and QR code
    - Apple Pay / Google Pay: Returns Stripe client secret
    """
    db_service = PaymentDatabaseService(db)
    
    # Validate participant exists and belongs to current user
    participant = await db_service.get_participant_with_tournament(payment_request.participant_id)
    if not participant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Participant not found"
        )
    
    if participant.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only make payments for your own registrations"
        )
    
    # Check if payment already exists
    existing_payment = await db_service.get_payment_by_participant(payment_request.participant_id)
    if existing_payment and existing_payment.status in [PaymentStatus.COMPLETED, PaymentStatus.PROCESSING]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment already exists for this participant"
        )
    
    # Validate amount matches tournament entry fee
    if payment_request.amount != participant.tournament.entry_fee:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment amount must match tournament entry fee"
        )
    
    try:
        # Create payment record
        payment = await db_service.create_payment_record(
            participant_id=payment_request.participant_id,
            tournament_id=participant.tournament_id,
            user_id=current_user.id,
            amount=payment_request.amount,
            currency=payment_request.currency,
            method=payment_request.method
        )
        
        # Handle different payment methods
        if payment_request.method == PaymentMethod.KASPI_QR:
            kaspi_service = KaspiPaymentService()
            
            qr_data = await kaspi_service.create_qr_payment(
                payment_id=payment.id,
                amount=payment_request.amount,
                user_email=current_user.email,
                description=f"Tournament: {participant.tournament.name}"
            )
            
            # Update payment with Kaspi data
            await db_service.update_payment_status(
                payment.id,
                PaymentStatus.PENDING,
                external_id=qr_data.get("transaction_id")
            )
            
            return KaspiQRResponse(
                payment_id=payment.id,
                payment_url=qr_data["payment_url"],
                qr_image_url=qr_data["qr_code"],
                expires_at=datetime.fromisoformat(qr_data["expires_at"]),
                amount=payment_request.amount,
                currency=payment_request.currency.value
            )
        
        elif payment_request.method in [PaymentMethod.APPLE_PAY, PaymentMethod.GOOGLE_PAY]:
            stripe_service = StripePaymentService()
            
            # Map payment method to Stripe types
            stripe_methods = {
                PaymentMethod.APPLE_PAY: ["card"],  # Apple Pay works through card payment method
                PaymentMethod.GOOGLE_PAY: ["card"]  # Google Pay works through card payment method
            }
            
            intent = await stripe_service.create_payment_intent(
                payment_id=payment.id,
                amount=payment_request.amount,
                currency=payment_request.currency,
                payment_method_types=stripe_methods[payment_request.method],
                metadata={
                    "user_id": current_user.id,
                    "participant_id": payment_request.participant_id,
                    "tournament_id": participant.tournament_id,
                    "tournament_name": participant.tournament.name
                }
            )
            
            # Update payment with Stripe data
            await db_service.update_payment_status(
                payment.id,
                PaymentStatus.PROCESSING,
                external_id=intent.id
            )
            
            return StripeWalletResponse(
                payment_id=payment.id,
                client_secret=intent.client_secret,
                amount=payment_request.amount,
                currency=payment_request.currency.value
            )
        
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Payment method {payment_request.method} not supported"
            )
    
    except Exception as e:
        logger.error(f"Payment initiation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Payment initiation failed"
        )


@router.post("/webhooks/stripe")
async def stripe_webhook_handler(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Handle Stripe webhook events for payment confirmation
    
    Processes successful payments and updates participant status
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    
    if not sig_header:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing Stripe signature"
        )
    
    try:
        # Verify webhook signature
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        logger.error("Invalid payload in Stripe webhook")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid payload"
        )
    except stripe.error.SignatureVerificationError:
        logger.error("Invalid signature in Stripe webhook")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid signature"
        )
    
    # Process webhook event
    background_tasks.add_task(process_stripe_webhook, event, db)
    
    return {"status": "success"}


async def process_stripe_webhook(event: dict, db: AsyncSession):
    """Background task to process Stripe webhook events"""
    db_service = PaymentDatabaseService(db)
    
    try:
        if event["type"] == "payment_intent.succeeded":
            payment_intent = event["data"]["object"]
            payment_id = payment_intent["metadata"].get("payment_id")
            
            if not payment_id:
                logger.error("No payment_id in Stripe webhook metadata")
                return
            
            # Update payment status
            success = await db_service.update_payment_status(
                payment_id,
                PaymentStatus.COMPLETED,
                external_id=payment_intent["id"]
            )
            
            if success:
                # Get payment to find participant
                payment = await db_service.get_payment_by_id(payment_id)
                if payment and payment.metadata:
                    participant_id = payment.metadata.get("participant_id")
                    if participant_id:
                        await db_service.activate_participant_on_payment(participant_id)
                        logger.info(f"Payment completed and participant activated: {participant_id}")
        
        elif event["type"] == "payment_intent.payment_failed":
            payment_intent = event["data"]["object"]
            payment_id = payment_intent["metadata"].get("payment_id")
            failure_reason = payment_intent.get("last_payment_error", {}).get("message", "Unknown error")
            
            if payment_id:
                await db_service.update_payment_status(
                    payment_id,
                    PaymentStatus.FAILED,
                    failure_reason=failure_reason
                )
                logger.info(f"Payment failed: {payment_id} - {failure_reason}")
    
    except Exception as e:
        logger.error(f"Error processing Stripe webhook: {e}")


@router.get("/status/{participant_id}", response_model=PaymentStatusResponse)
async def get_payment_status(
    participant_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Get payment status for a participant
    
    Returns current payment status, method, and details
    """
    db_service = PaymentDatabaseService(db)
    
    # Validate participant exists and belongs to current user
    participant = await db_service.get_participant_with_tournament(participant_id)
    if not participant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Participant not found"
        )
    
    if participant.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only check payment status for your own registrations"
        )
    
    # Get payment record
    payment = await db_service.get_payment_by_participant(participant_id)
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No payment found for this participant"
        )
    
    return PaymentStatusResponse(
        payment_id=payment.id,
        participant_id=participant_id,
        status=payment.status,
        method=payment.method,
        amount=payment.amount,
        currency=payment.currency,
        created_at=payment.created_at,
        updated_at=payment.updated_at,
        failure_reason=payment.failure_reason
    )


@router.get("/participant/{participant_id}/history", response_model=List[PaymentStatusResponse])
async def get_payment_history(
    participant_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    """Get payment history for a participant"""
    db_service = PaymentDatabaseService(db)
    
    # Validate participant exists and belongs to current user
    participant = await db_service.get_participant_with_tournament(participant_id)
    if not participant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Participant not found"
        )
    
    if participant.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only check payment history for your own registrations"
        )
    
    # Get all payments for participant
    query = select(Payment).where(
        Payment.metadata.contains({"participant_id": participant_id})
    ).order_by(Payment.created_at.desc())
    
    result = await db.execute(query)
    payments = result.scalars().all()
    
    return [
        PaymentStatusResponse(
            payment_id=payment.id,
            participant_id=participant_id,
            status=payment.status,
            method=payment.method,
            amount=payment.amount,
            currency=payment.currency,
            created_at=payment.created_at,
            updated_at=payment.updated_at,
            failure_reason=payment.failure_reason
        )
        for payment in payments
    ]


# ========================
# ADMIN ROUTES
# ========================

@router.get("/admin/payments", response_model=List[PaymentStatusResponse])
async def get_all_payments(
    tournament_id: Optional[str] = None,
    status: Optional[PaymentStatus] = None,
    limit: int = 100,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Admin endpoint to get all payments with optional filters
    
    Requires admin or organizer role
    """
    # Note: You'll need to implement role checking based on your auth system
    # This is a placeholder for the role check
    if not hasattr(current_user, 'roles') or 'ADMIN' not in [role.role for role in current_user.roles]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    query = select(Payment)
    
    if tournament_id:
        query = query.where(Payment.tournament_id == tournament_id)
    if status:
        query = query.where(Payment.status == status)
    
    query = query.order_by(Payment.created_at.desc()).limit(limit).offset(offset)
    
    result = await db.execute(query)
    payments = result.scalars().all()
    
    return [
        PaymentStatusResponse(
            payment_id=payment.id,
            participant_id=payment.metadata.get("participant_id", ""),
            status=payment.status,
            method=payment.method,
            amount=payment.amount,
            currency=payment.currency,
            created_at=payment.created_at,
            updated_at=payment.updated_at,
            failure_reason=payment.failure_reason
        )
        for payment in payments
    ]


# ========================
# HEALTH CHECK
# ========================

@router.get("/health")
async def payment_health_check():
    """Health check endpoint for payment service"""
    try:
        # Check Stripe connectivity
        stripe.Account.retrieve()
        
        return {
            "status": "healthy",
            "services": {
                "stripe": "connected",
                "kaspi": "configured",  # Mock for demo
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Payment service health check failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment service unhealthy"
        ) 