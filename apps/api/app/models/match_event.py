"""
Match Event models for the tournament platform
Provides comprehensive event logging for all referee actions during matches
"""

from sqlalchemy import Column, String, Integer, DateTime, JSON, Enum as SQLEnum, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, Union
from datetime import datetime
from enum import Enum

Base = declarative_base()

class MatchEventType(str, Enum):
    """Enumeration of all possible match event types"""
    POINTS_2 = "POINTS_2"
    ADVANTAGE = "ADVANTAGE"
    PENALTY = "PENALTY"
    SUBMISSION = "SUBMISSION"
    START = "START"
    STOP = "STOP"
    RESET = "RESET"
    COMMENT = "COMMENT"
    # Additional system events
    MATCH_CREATED = "MATCH_CREATED"
    STATE_CHANGE = "STATE_CHANGE"
    TIMER_UPDATE = "TIMER_UPDATE"
    AUTO_FINISH = "AUTO_FINISH"

# SQLAlchemy Models
class MatchEventModel(Base):
    """
    Comprehensive match event model for logging all referee actions
    and system events during a match
    """
    __tablename__ = "match_events"
    
    id = Column(String, primary_key=True)
    match_id = Column(String, ForeignKey("matches.id"), nullable=False, index=True)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    actor_id = Column(String, ForeignKey("users.id"), nullable=False)  # referee user id
    participant_id = Column(String, nullable=True)  # optional participant involved
    event_type = Column(SQLEnum(MatchEventType), nullable=False, index=True)
    value = Column(String, nullable=True)  # penalty level, comment text, etc.
    metadata = Column(JSON, nullable=True)  # additional event data
    
    # Relationships
    match = relationship("MatchModel", foreign_keys=[match_id])
    actor = relationship("User", foreign_keys=[actor_id])

# Pydantic Models for API
class MatchEventCreate(BaseModel):
    """Request model for creating a new match event"""
    match_id: str
    actor_id: str
    participant_id: Optional[str] = None
    event_type: MatchEventType
    value: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class MatchEventResponse(BaseModel):
    """Response model for match events"""
    id: str
    match_id: str
    timestamp: datetime
    actor_id: str
    participant_id: Optional[str] = None
    event_type: MatchEventType
    value: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    
    class Config:
        from_attributes = True

class MatchEventWithDetails(MatchEventResponse):
    """Enhanced match event response with actor details"""
    actor_name: Optional[str] = None
    participant_name: Optional[str] = None

class MatchEventsList(BaseModel):
    """Response model for list of match events"""
    events: list[MatchEventResponse]
    total_count: int
    match_id: str

class MatchEventsQuery(BaseModel):
    """Query parameters for filtering match events"""
    event_type: Optional[MatchEventType] = None
    actor_id: Optional[str] = None
    participant_id: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    limit: int = Field(default=100, ge=1, le=1000)
    offset: int = Field(default=0, ge=0)

# Helper functions for event creation
def create_score_event_metadata(
    action: str,
    old_score: Dict[str, int],
    new_score: Dict[str, int],
    **kwargs
) -> Dict[str, Any]:
    """Create metadata for scoring events"""
    return {
        "action": action,
        "old_score": old_score,
        "new_score": new_score,
        "score_difference": {
            key: new_score.get(key, 0) - old_score.get(key, 0)
            for key in new_score.keys()
        },
        **kwargs
    }

def create_state_change_metadata(
    old_state: str,
    new_state: str,
    **kwargs
) -> Dict[str, Any]:
    """Create metadata for state change events"""
    return {
        "old_state": old_state,
        "new_state": new_state,
        "transition_valid": True,  # Could add validation logic here
        **kwargs
    }

def create_timer_metadata(
    old_time: Optional[int],
    new_time: int,
    **kwargs
) -> Dict[str, Any]:
    """Create metadata for timer events"""
    return {
        "old_time_remaining": old_time,
        "new_time_remaining": new_time,
        "time_change": (new_time - old_time) if old_time is not None else None,
        **kwargs
    }

def create_comment_metadata(
    comment_text: str,
    category: Optional[str] = None,
    **kwargs
) -> Dict[str, Any]:
    """Create metadata for comment events"""
    return {
        "comment": comment_text,
        "category": category,
        "length": len(comment_text),
        **kwargs
    }

def create_penalty_metadata(
    penalty_level: int,
    reason: Optional[str] = None,
    **kwargs
) -> Dict[str, Any]:
    """Create metadata for penalty events"""
    return {
        "penalty_level": penalty_level,
        "reason": reason,
        "is_disqualification": penalty_level >= 3,
        **kwargs
    } 