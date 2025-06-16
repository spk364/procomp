"""
Match models for the tournament platform
"""

from sqlalchemy import Column, String, Integer, Float, DateTime, JSON, Enum as SQLEnum, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime
from enum import Enum

Base = declarative_base()

class MatchState(str, Enum):
    SCHEDULED = "SCHEDULED"
    IN_PROGRESS = "IN_PROGRESS"
    PAUSED = "PAUSED"
    FINISHED = "FINISHED"
    CANCELLED = "CANCELLED"

class ScoreAction(str, Enum):
    POINTS_2 = "POINTS_2"
    ADVANTAGE = "ADVANTAGE"
    PENALTY = "PENALTY"
    SUBMISSION = "SUBMISSION"
    RESET_MATCH = "RESET_MATCH"
    START_MATCH = "START_MATCH"
    PAUSE_MATCH = "PAUSE_MATCH"
    END_MATCH = "END_MATCH"

# SQLAlchemy Models
class MatchModel(Base):
    __tablename__ = "matches"
    
    id = Column(String, primary_key=True)
    participant1_id = Column(String, nullable=False)
    participant2_id = Column(String, nullable=False)
    category = Column(String, nullable=False)
    division = Column(String, nullable=False)
    duration = Column(Integer, nullable=False)  # in seconds
    time_remaining = Column(Integer, nullable=False)  # in seconds
    state = Column(SQLEnum(MatchState), nullable=False, default=MatchState.SCHEDULED)
    
    # JSON fields for scores
    score1 = Column(JSON, nullable=False, default={"points": 0, "advantages": 0, "penalties": 0, "submissions": 0})
    score2 = Column(JSON, nullable=False, default={"points": 0, "advantages": 0, "penalties": 0, "submissions": 0})
    
    # JSON fields for participant info (denormalized for quick access)
    participant1_info = Column(JSON, nullable=False)
    participant2_info = Column(JSON, nullable=False)
    
    referee_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    referee = relationship("User", foreign_keys=[referee_id])

class MatchEventModel(Base):
    __tablename__ = "match_events"
    
    id = Column(String, primary_key=True)
    match_id = Column(String, ForeignKey("matches.id"), nullable=False)
    event_type = Column(String, nullable=False)  # SCORE_UPDATE, STATE_CHANGE, etc.
    event_data = Column(JSON, nullable=False)
    created_by = Column(String, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    match = relationship("MatchModel", foreign_keys=[match_id])
    creator = relationship("User", foreign_keys=[created_by])

# Pydantic Models for API
class Score(BaseModel):
    points: int = Field(0, ge=0)
    advantages: int = Field(0, ge=0)
    penalties: int = Field(0, ge=0)
    submissions: int = Field(0, ge=0)

class Participant(BaseModel):
    id: str
    name: str
    team: Optional[str] = None
    weight: Optional[float] = None
    belt: Optional[str] = None

class Referee(BaseModel):
    id: str
    name: str

class Match(BaseModel):
    id: str
    participant1: Participant
    participant2: Participant
    category: str
    division: str
    duration: int  # in seconds
    time_remaining: int  # in seconds
    state: MatchState
    score1: Score
    score2: Score
    referee: Optional[Referee] = None
    created_at: str
    updated_at: str
    
    class Config:
        from_attributes = True

class MatchCreate(BaseModel):
    participant1_id: str
    participant2_id: str
    category: str
    division: str
    duration: int = Field(300, gt=0)  # default 5 minutes
    referee_id: Optional[str] = None

class MatchUpdate(BaseModel):
    state: Optional[MatchState] = None
    time_remaining: Optional[int] = None
    referee_id: Optional[str] = None

class ScoreUpdateRequest(BaseModel):
    action: ScoreAction
    participant_id: str

class MatchEvent(BaseModel):
    id: str
    match_id: str
    event_type: str
    event_data: Dict[str, Any]
    created_by: str
    created_at: str
    
    class Config:
        from_attributes = True

# Helper functions
def create_initial_score() -> Dict[str, int]:
    """Create an initial score dictionary"""
    return {"points": 0, "advantages": 0, "penalties": 0, "submissions": 0}

def apply_score_action(score: Dict[str, int], action: ScoreAction) -> Dict[str, int]:
    """Apply a score action to a score dictionary"""
    new_score = score.copy()
    
    if action == ScoreAction.POINTS_2:
        new_score["points"] += 2
    elif action == ScoreAction.ADVANTAGE:
        new_score["advantages"] += 1
    elif action == ScoreAction.PENALTY:
        new_score["penalties"] += 1
    elif action == ScoreAction.SUBMISSION:
        new_score["submissions"] += 1
    
    return new_score

def get_match_winner(match: Match) -> Optional[str]:
    """Determine the winner of a match based on current scores"""
    score1 = match.score1
    score2 = match.score2
    
    # Check for submission wins
    if score1.submissions > 0:
        return match.participant1.id
    if score2.submissions > 0:
        return match.participant2.id
    
    # Check for disqualification (3+ penalties)
    if score1.penalties >= 3:
        return match.participant2.id
    if score2.penalties >= 3:
        return match.participant1.id
    
    # Points comparison
    if score1.points > score2.points:
        return match.participant1.id
    if score2.points > score1.points:
        return match.participant2.id
    
    # Advantages comparison
    if score1.advantages > score2.advantages:
        return match.participant1.id
    if score2.advantages > score1.advantages:
        return match.participant2.id
    
    # Penalties comparison (fewer penalties wins)
    if score1.penalties < score2.penalties:
        return match.participant1.id
    if score2.penalties < score1.penalties:
        return match.participant2.id
    
    return None  # Draw/tie

def is_match_finished(match: Match) -> bool:
    """Check if a match should be automatically finished"""
    score1 = match.score1
    score2 = match.score2
    
    # Submission ends match
    if score1.submissions > 0 or score2.submissions > 0:
        return True
    
    # 3+ penalties ends match (disqualification)
    if score1.penalties >= 3 or score2.penalties >= 3:
        return True
    
    # Time expired
    if match.time_remaining <= 0:
        return True
    
    return False 