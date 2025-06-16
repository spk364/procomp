"""User models matching Prisma schema."""
from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, EmailStr
from sqlalchemy import Boolean, Column, DateTime, String
from sqlalchemy.orm import relationship

from app.core.database import Base


class Role(str, Enum):
    """User roles matching Prisma enum."""
    ADMIN = "ADMIN"
    ORGANIZER = "ORGANIZER"
    COMPETITOR = "COMPETITOR"
    REFEREE = "REFEREE"
    COACH = "COACH"


class UserBase(BaseModel):
    """Base user model for API responses."""
    id: str
    email: EmailStr
    username: Optional[str] = None
    firstName: str
    lastName: str
    avatarUrl: Optional[str] = None
    phone: Optional[str] = None
    isActive: bool = True
    supabaseId: Optional[str] = None
    clubId: Optional[str] = None


class UserResponse(UserBase):
    """User response model with roles."""
    roles: List[Role] = []
    createdAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None


class UserCreate(BaseModel):
    """User creation model."""
    email: EmailStr
    firstName: str
    lastName: str
    supabaseId: str
    username: Optional[str] = None
    avatarUrl: Optional[str] = None
    phone: Optional[str] = None
    clubId: Optional[str] = None
    roles: List[Role] = [Role.COMPETITOR]


class UserUpdate(BaseModel):
    """User update model."""
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    username: Optional[str] = None
    avatarUrl: Optional[str] = None
    phone: Optional[str] = None
    clubId: Optional[str] = None
    isActive: Optional[bool] = None


class CurrentUser(BaseModel):
    """Current authenticated user model."""
    id: str
    email: EmailStr
    firstName: str
    lastName: str
    username: Optional[str] = None
    avatarUrl: Optional[str] = None
    supabaseId: str
    roles: List[Role]
    isActive: bool
    
    @property
    def full_name(self) -> str:
        """Get user's full name."""
        return f"{self.firstName} {self.lastName}"
    
    def has_role(self, role: Role) -> bool:
        """Check if user has specific role."""
        return role in self.roles
    
    def has_any_role(self, roles: List[Role]) -> bool:
        """Check if user has any of the specified roles."""
        return any(role in self.roles for role in roles)
    
    def is_admin(self) -> bool:
        """Check if user is admin."""
        return self.has_role(Role.ADMIN)
    
    def can_organize_tournaments(self) -> bool:
        """Check if user can organize tournaments."""
        return self.has_any_role([Role.ADMIN, Role.ORGANIZER])
    
    def can_referee_matches(self) -> bool:
        """Check if user can referee matches."""
        return self.has_any_role([Role.ADMIN, Role.REFEREE])


# SQLAlchemy models (if needed for direct DB operations)
class User(Base):
    """SQLAlchemy User model (mirrors Prisma schema)."""
    __tablename__ = "users"
    
    id = Column(String, primary_key=True)
    email = Column(String, unique=True, nullable=False)
    username = Column(String, unique=True, nullable=True)
    firstName = Column(String, nullable=False)
    lastName = Column(String, nullable=False)
    avatarUrl = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    isActive = Column(Boolean, default=True)
    supabaseId = Column(String, unique=True, nullable=True)
    clubId = Column(String, nullable=True)
    createdAt = Column(DateTime, default=datetime.utcnow)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow) 