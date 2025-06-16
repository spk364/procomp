"""
Match service for handling match business logic and database operations
"""

from sqlalchemy.orm import Session
from typing import Optional, List
import uuid
from datetime import datetime

from app.models.match import (
    MatchModel, MatchEventModel, Match, MatchCreate, MatchUpdate, 
    ScoreAction, MatchState, Score, Participant, Referee,
    apply_score_action, create_initial_score, is_match_finished
)
from app.models.match_event import MatchEventType, MatchEventCreate
from services.match_event_service import MatchEventService
from app.core.database import get_db
from app.core.exceptions import NotFoundError, ValidationError, PermissionError

class MatchService:
    """Service class for match operations"""
    
    def __init__(self, db: Optional[Session] = None):
        self.db = db or next(get_db())
        self.event_service = MatchEventService(self.db)

    async def get_match(self, match_id: str) -> Optional[Match]:
        """Get a match by ID"""
        match_model = self.db.query(MatchModel).filter(MatchModel.id == match_id).first()
        
        if not match_model:
            return None
        
        return self._model_to_pydantic(match_model)

    async def create_match(self, match_data: MatchCreate, created_by: str) -> Match:
        """Create a new match"""
        
        # Validate participants exist
        # TODO: Add participant validation logic
        
        match_id = str(uuid.uuid4())
        
        # Create match model
        match_model = MatchModel(
            id=match_id,
            participant1_id=match_data.participant1_id,
            participant2_id=match_data.participant2_id,
            category=match_data.category,
            division=match_data.division,
            duration=match_data.duration,
            time_remaining=match_data.duration,
            state=MatchState.SCHEDULED,
            score1=create_initial_score(),
            score2=create_initial_score(),
            participant1_info={},  # TODO: Fetch from participant service
            participant2_info={},  # TODO: Fetch from participant service
            referee_id=match_data.referee_id
        )
        
        self.db.add(match_model)
        
        # Create event log using the new event service
        await self.event_service.log_event(MatchEventCreate(
            match_id=match_id,
            actor_id=created_by,
            event_type=MatchEventType.MATCH_CREATED,
            metadata=match_data.dict()
        ))
        
        self.db.commit()
        self.db.refresh(match_model)
        
        return self._model_to_pydantic(match_model)

    async def update_match_state(self, match_id: str, new_state: MatchState, updated_by: str) -> Match:
        """Update match state"""
        match_model = self.db.query(MatchModel).filter(MatchModel.id == match_id).first()
        
        if not match_model:
            raise NotFoundError(f"Match {match_id} not found")
        
        # Validate state transition
        if not self._is_valid_state_transition(match_model.state, new_state):
            raise ValidationError(f"Invalid state transition from {match_model.state} to {new_state}")
        
        old_state = match_model.state
        match_model.state = new_state
        match_model.updated_at = datetime.utcnow()
        
        # Create event log using the new event service
        await self.event_service.log_state_change_event(
            match_id=match_id,
            actor_id=updated_by,
            old_state=old_state.value,
            new_state=new_state.value
        )
        
        self.db.commit()
        self.db.refresh(match_model)
        
        return self._model_to_pydantic(match_model)

    async def apply_score_action(
        self, 
        match_id: str, 
        action: ScoreAction, 
        participant_id: str, 
        updated_by: str
    ) -> Match:
        """Apply a score action to a match"""
        match_model = self.db.query(MatchModel).filter(MatchModel.id == match_id).first()
        
        if not match_model:
            raise NotFoundError(f"Match {match_id} not found")
        
        # Validate match is in progress
        if match_model.state != MatchState.IN_PROGRESS:
            raise ValidationError("Can only update scores during an active match")
        
        # Determine which participant's score to update
        if participant_id == match_model.participant1_id:
            current_score = match_model.score1
            is_participant1 = True
        elif participant_id == match_model.participant2_id:
            current_score = match_model.score2
            is_participant1 = False
        else:
            raise ValidationError("Invalid participant ID for this match")
        
        # Apply score action
        new_score = apply_score_action(current_score, action)
        
        # Update the score
        if is_participant1:
            match_model.score1 = new_score
        else:
            match_model.score2 = new_score
        
        match_model.updated_at = datetime.utcnow()
        
        # Create event log using the new event service
        event_type_map = {
            ScoreAction.POINTS_2: MatchEventType.POINTS_2,
            ScoreAction.ADVANTAGE: MatchEventType.ADVANTAGE,
            ScoreAction.PENALTY: MatchEventType.PENALTY,
            ScoreAction.SUBMISSION: MatchEventType.SUBMISSION,
        }
        
        event_type = event_type_map.get(action, MatchEventType.COMMENT)
        
        await self.event_service.log_score_event(
            match_id=match_id,
            actor_id=updated_by,
            participant_id=participant_id,
            event_type=event_type,
            old_score=current_score,
            new_score=new_score,
            action=action.value
        )
        
        # Check if match should auto-finish
        match_pydantic = self._model_to_pydantic(match_model)
        if is_match_finished(match_pydantic):
            match_model.state = MatchState.FINISHED
            
            await self.event_service.log_event(MatchEventCreate(
                match_id=match_id,
                actor_id="system",
                event_type=MatchEventType.AUTO_FINISH,
                metadata={
                    "reason": "Automatic finish triggered",
                    "final_score1": new_score if is_participant1 else match_model.score1,
                    "final_score2": new_score if not is_participant1 else match_model.score2
                }
            ))
        
        self.db.commit()
        self.db.refresh(match_model)
        
        return self._model_to_pydantic(match_model)

    async def update_match_timer(self, match_id: str, time_remaining: int, updated_by: str) -> Match:
        """Update match timer"""
        match_model = self.db.query(MatchModel).filter(MatchModel.id == match_id).first()
        
        if not match_model:
            raise NotFoundError(f"Match {match_id} not found")
        
        if time_remaining < 0:
            raise ValidationError("Time remaining cannot be negative")
        
        old_time = match_model.time_remaining
        match_model.time_remaining = time_remaining
        match_model.updated_at = datetime.utcnow()
        
        # Create event log using the new event service
        await self.event_service.log_timer_event(
            match_id=match_id,
            actor_id=updated_by,
            old_time=old_time,
            new_time=time_remaining
        )
        
        self.db.commit()
        self.db.refresh(match_model)
        
        # Auto-finish if time expired
        if time_remaining <= 0 and match_model.state == MatchState.IN_PROGRESS:
            match_model.state = MatchState.FINISHED
            
            await self.event_service.log_event(MatchEventCreate(
                match_id=match_id,
                actor_id="system",
                event_type=MatchEventType.AUTO_FINISH,
                metadata={"reason": "Time expired"}
            ))
        
        self.db.commit()
        self.db.refresh(match_model)
        
        return self._model_to_pydantic(match_model)

    async def get_match_events(self, match_id: str, limit: int = 50) -> List[dict]:
        """Get events for a match"""
        events = (
            self.db.query(MatchEventModel)
            .filter(MatchEventModel.match_id == match_id)
            .order_by(MatchEventModel.created_at.desc())
            .limit(limit)
            .all()
        )
        
        return [
            {
                "id": event.id,
                "event_type": event.event_type,
                "event_data": event.event_data,
                "created_by": event.created_by,
                "created_at": event.created_at.isoformat()
            }
            for event in events
        ]

    async def get_matches_by_referee(self, referee_id: str, state: Optional[MatchState] = None) -> List[Match]:
        """Get matches assigned to a referee"""
        query = self.db.query(MatchModel).filter(MatchModel.referee_id == referee_id)
        
        if state:
            query = query.filter(MatchModel.state == state)
        
        matches = query.order_by(MatchModel.created_at.desc()).all()
        return [self._model_to_pydantic(match) for match in matches]

    async def assign_referee(self, match_id: str, referee_id: str, assigned_by: str) -> Match:
        """Assign a referee to a match"""
        match_model = self.db.query(MatchModel).filter(MatchModel.id == match_id).first()
        
        if not match_model:
            raise NotFoundError(f"Match {match_id} not found")
        
        # TODO: Validate referee exists and has proper role
        
        old_referee = match_model.referee_id
        match_model.referee_id = referee_id
        match_model.updated_at = datetime.utcnow()
        
        # Create event log using the new event service
        await self.event_service.log_event(MatchEventCreate(
            match_id=match_id,
            actor_id=assigned_by,
            event_type=MatchEventType.COMMENT,
            value="Referee assigned",
            metadata={
                "old_referee": old_referee,
                "new_referee": referee_id
            }
        ))
        
        self.db.commit()
        self.db.refresh(match_model)
        
        return self._model_to_pydantic(match_model)

    def _model_to_pydantic(self, match_model: MatchModel) -> Match:
        """Convert SQLAlchemy model to Pydantic model"""
        
        # TODO: Fetch actual participant and referee data
        participant1 = Participant(
            id=match_model.participant1_id,
            name=match_model.participant1_info.get("name", "Participant 1"),
            team=match_model.participant1_info.get("team"),
            weight=match_model.participant1_info.get("weight"),
            belt=match_model.participant1_info.get("belt")
        )
        
        participant2 = Participant(
            id=match_model.participant2_id,
            name=match_model.participant2_info.get("name", "Participant 2"),
            team=match_model.participant2_info.get("team"),
            weight=match_model.participant2_info.get("weight"),
            belt=match_model.participant2_info.get("belt")
        )
        
        referee = None
        if match_model.referee_id:
            # TODO: Fetch actual referee data
            referee = Referee(
                id=match_model.referee_id,
                name="Referee Name"  # TODO: Get from user service
            )
        
        return Match(
            id=match_model.id,
            participant1=participant1,
            participant2=participant2,
            category=match_model.category,
            division=match_model.division,
            duration=match_model.duration,
            time_remaining=match_model.time_remaining,
            state=match_model.state,
            score1=Score(**match_model.score1),
            score2=Score(**match_model.score2),
            referee=referee,
            created_at=match_model.created_at.isoformat(),
            updated_at=match_model.updated_at.isoformat()
        )

    def _is_valid_state_transition(self, current_state: MatchState, new_state: MatchState) -> bool:
        """Validate state transitions"""
        valid_transitions = {
            MatchState.SCHEDULED: [MatchState.IN_PROGRESS, MatchState.CANCELLED],
            MatchState.IN_PROGRESS: [MatchState.PAUSED, MatchState.FINISHED],
            MatchState.PAUSED: [MatchState.IN_PROGRESS, MatchState.FINISHED],
            MatchState.FINISHED: [],  # No transitions from finished
            MatchState.CANCELLED: []  # No transitions from cancelled
        }
        
        return new_state in valid_transitions.get(current_state, []) 