from datetime import datetime, date
from typing import List, Optional, Literal
from enum import Enum

from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel, Field, validator
from sqlalchemy.ext.asyncio import AsyncSession

# Assuming these imports exist in your project
from db import get_db_session
from auth import get_current_user, get_organizer_user
from services.payment import PaymentService

router = APIRouter(prefix="/api/v1", tags=["tournaments"])

# Enums
class Discipline(str, Enum):
    KARATE = "karate"
    TAEKWONDO = "taekwondo"
    JUDO = "judo"
    KICKBOXING = "kickboxing"
    MMA = "mma"
    BOXING = "boxing"

class PaymentMethod(str, Enum):
    KASPI_QR = "kaspi_qr"
    APPLE_PAY = "apple_pay"
    GOOGLE_PAY = "google_pay"

class TournamentStatus(str, Enum):
    UPCOMING = "upcoming"
    ONGOING = "ongoing"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

# Pydantic Models
class CategoryModel(BaseModel):
    id: int
    name: str
    min_age: int
    max_age: int
    min_weight: float
    max_weight: float
    gender: Literal["male", "female", "mixed"]
    registration_fee: float
    max_participants: int
    current_participants: int = 0

class TournamentBase(BaseModel):
    name: str = Field(..., min_length=3, max_length=200)
    discipline: Discipline
    description: Optional[str] = Field(None, max_length=1000)
    country: str = Field(..., min_length=2, max_length=100)
    city: str = Field(..., min_length=2, max_length=100)
    venue: str = Field(..., min_length=3, max_length=200)
    start_date: date
    end_date: date
    registration_deadline: datetime
    status: TournamentStatus = TournamentStatus.UPCOMING

    @validator('end_date')
    def validate_end_date(cls, v, values):
        if 'start_date' in values and v < values['start_date']:
            raise ValueError('End date must be after start date')
        return v

    @validator('registration_deadline')
    def validate_registration_deadline(cls, v, values):
        if 'start_date' in values and v.date() >= values['start_date']:
            raise ValueError('Registration deadline must be before tournament start')
        return v

class TournamentCreate(TournamentBase):
    categories: List[CategoryModel]

class TournamentResponse(TournamentBase):
    id: int
    organizer_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class TournamentDetailResponse(TournamentResponse):
    categories: List[CategoryModel]

class RegistrationRequest(BaseModel):
    tournament_id: int
    category_id: int
    participant_name: str = Field(..., min_length=2, max_length=100)
    participant_age: int = Field(..., ge=5, le=100)
    participant_weight: float = Field(..., gt=0, le=200)
    participant_gender: Literal["male", "female"]
    contact_email: str = Field(..., regex=r'^[^@]+@[^@]+\.[^@]+$')
    contact_phone: str = Field(..., min_length=10, max_length=20)

class RegistrationResponse(BaseModel):
    id: int
    tournament_id: int
    category_id: int
    participant_name: str
    registration_date: datetime
    payment_required: bool
    payment_amount: float

class PaymentInitiateRequest(BaseModel):
    registration_id: int
    payment_method: PaymentMethod
    return_url: Optional[str] = None

class PaymentInitiateResponse(BaseModel):
    payment_id: str
    payment_url: Optional[str] = None
    payment_token: Optional[str] = None
    qr_code: Optional[str] = None
    amount: float
    currency: str = "KZT"
    expires_at: datetime

# Database abstraction layer (assuming these methods exist)
class DatabaseService:
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def get_tournaments(self, discipline: Optional[str], country: Optional[str], 
                            date_from: Optional[date], date_to: Optional[date]):
        # Implementation would filter tournaments based on parameters
        pass
    
    async def get_tournament_by_id(self, tournament_id: int):
        # Implementation would fetch tournament with categories
        pass
    
    async def create_tournament(self, tournament_data: dict, organizer_id: int):
        # Implementation would create tournament and categories
        pass
    
    async def create_registration(self, registration_data: dict, user_id: int):
        # Implementation would create registration with validation
        pass
    
    async def get_registration_by_id(self, registration_id: int):
        # Implementation would fetch registration details
        pass

# Routes
@router.get("/tournaments", response_model=List[TournamentResponse])
async def get_tournaments(
    discipline: Optional[Discipline] = Query(None, description="Filter by discipline"),
    country: Optional[str] = Query(None, description="Filter by country"),
    date_from: Optional[date] = Query(None, description="Filter tournaments from this date"),
    date_to: Optional[date] = Query(None, description="Filter tournaments until this date"),
    db: AsyncSession = Depends(get_db_session)
):
    """Get list of tournaments with optional filters"""
    try:
        db_service = DatabaseService(db)
        tournaments = await db_service.get_tournaments(
            discipline=discipline.value if discipline else None,
            country=country,
            date_from=date_from,
            date_to=date_to
        )
        return tournaments
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch tournaments"
        )

@router.get("/tournaments/{tournament_id}", response_model=TournamentDetailResponse)
async def get_tournament_detail(
    tournament_id: int,
    db: AsyncSession = Depends(get_db_session)
):
    """Get detailed tournament information with categories"""
    try:
        db_service = DatabaseService(db)
        tournament = await db_service.get_tournament_by_id(tournament_id)
        
        if not tournament:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tournament not found"
            )
        
        return tournament
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch tournament details"
        )

@router.post("/tournaments", response_model=TournamentResponse, status_code=status.HTTP_201_CREATED)
async def create_tournament(
    tournament_data: TournamentCreate,
    current_user = Depends(get_organizer_user),
    db: AsyncSession = Depends(get_db_session)
):
    """Create a new tournament (organizer only)"""
    try:
        if not tournament_data.categories:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tournament must have at least one category"
            )
        
        db_service = DatabaseService(db)
        tournament = await db_service.create_tournament(
            tournament_data.dict(),
            organizer_id=current_user.id
        )
        
        return tournament
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create tournament"
        )

@router.post("/register", response_model=RegistrationResponse, status_code=status.HTTP_201_CREATED)
async def register_for_tournament(
    registration_data: RegistrationRequest,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    """Register a user to a tournament category"""
    try:
        db_service = DatabaseService(db)
        
        # Get tournament and category details for validation
        tournament = await db_service.get_tournament_by_id(registration_data.tournament_id)
        if not tournament:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tournament not found"
            )
        
        # Check if registration is still open
        if datetime.now() > tournament.registration_deadline:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Registration deadline has passed"
            )
        
        # Find the category
        category = None
        for cat in tournament.categories:
            if cat.id == registration_data.category_id:
                category = cat
                break
        
        if not category:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Category not found in this tournament"
            )
        
        # Validate participant criteria
        if not (category.min_age <= registration_data.participant_age <= category.max_age):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Participant age must be between {category.min_age} and {category.max_age}"
            )
        
        if not (category.min_weight <= registration_data.participant_weight <= category.max_weight):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Participant weight must be between {category.min_weight}kg and {category.max_weight}kg"
            )
        
        if category.gender != "mixed" and category.gender != registration_data.participant_gender:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"This category is for {category.gender} participants only"
            )
        
        # Check if category is full
        if category.current_participants >= category.max_participants:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Category is full"
            )
        
        # Create registration
        registration = await db_service.create_registration(
            registration_data.dict(),
            user_id=current_user.id
        )
        
        return registration
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create registration"
        )

@router.post("/payments/initiate", response_model=PaymentInitiateResponse)
async def initiate_payment(
    payment_request: PaymentInitiateRequest,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    """Initiate payment for tournament registration"""
    try:
        db_service = DatabaseService(db)
        
        # Get registration details
        registration = await db_service.get_registration_by_id(payment_request.registration_id)
        if not registration:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Registration not found"
            )
        
        # Verify ownership
        if registration.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only pay for your own registrations"
            )
        
        # Check if payment is already completed
        if registration.payment_status == "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payment already completed for this registration"
            )
        
        # Initialize payment service
        payment_service = PaymentService()
        payment_response = await payment_service.initiate_payment(
            amount=registration.payment_amount,
            method=payment_request.payment_method,
            registration_id=registration.id,
            user_id=current_user.id,
            return_url=payment_request.return_url
        )
        
        return payment_response
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to initiate payment"
        )

# Health check endpoint
@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now()} 