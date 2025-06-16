"""
Match Event Service for comprehensive event logging
Handles all referee actions and system events during matches
"""

from sqlalchemy.orm import Session
from sqlalchemy import and_, desc, func
from typing import Optional, List, Dict, Any
import uuid
from datetime import datetime, timedelta
import json
import logging

from app.models.match_event import (
    MatchEventModel, MatchEventType, MatchEventCreate, MatchEventResponse,
    MatchEventWithDetails, MatchEventsList, MatchEventsQuery,
    create_score_event_metadata, create_state_change_metadata,
    create_timer_metadata, create_comment_metadata, create_penalty_metadata
)
from app.core.database import get_db
from app.core.exceptions import NotFoundError, ValidationError

logger = logging.getLogger(__name__)

class MatchEventService:
    """
    Service class for comprehensive match event logging and retrieval
    Provides async operations for all referee actions and system events
    """
    
    def __init__(self, db: Optional[Session] = None):
        self.db = db or next(get_db())

    async def log_event(self, event: MatchEventCreate) -> MatchEventResponse:
        """
        Log a new match event to the database
        
        Args:
            event: MatchEventCreate containing all event details
            
        Returns:
            MatchEventResponse: The created event with assigned ID and timestamp
            
        Raises:
            ValidationError: If event data is invalid
        """
        try:
            # Generate unique event ID
            event_id = str(uuid.uuid4())
            
            # Create event model
            event_model = MatchEventModel(
                id=event_id,
                match_id=event.match_id,
                timestamp=datetime.utcnow(),
                actor_id=event.actor_id,
                participant_id=event.participant_id,
                event_type=event.event_type,
                value=event.value,
                metadata=event.metadata
            )
            
            # Add to database
            self.db.add(event_model)
            self.db.commit()
            self.db.refresh(event_model)
            
            logger.info(f"Logged event {event.event_type} for match {event.match_id} by {event.actor_id}")
            
            return MatchEventResponse.from_orm(event_model)
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to log event: {str(e)}")
            raise ValidationError(f"Failed to log event: {str(e)}")

    async def log_score_event(
        self,
        match_id: str,
        actor_id: str,
        participant_id: str,
        event_type: MatchEventType,
        old_score: Dict[str, int],
        new_score: Dict[str, int],
        **kwargs
    ) -> MatchEventResponse:
        """
        Convenience method for logging scoring events with proper metadata
        
        Args:
            match_id: ID of the match
            actor_id: ID of the referee/actor
            participant_id: ID of the participant being scored
            event_type: Type of scoring event (POINTS_2, ADVANTAGE, PENALTY, etc.)
            old_score: Previous score state
            new_score: New score state
            **kwargs: Additional metadata
            
        Returns:
            MatchEventResponse: The created event
        """
        metadata = create_score_event_metadata(
            action=event_type.value,
            old_score=old_score,
            new_score=new_score,
            **kwargs
        )
        
        event = MatchEventCreate(
            match_id=match_id,
            actor_id=actor_id,
            participant_id=participant_id,
            event_type=event_type,
            metadata=metadata
        )
        
        return await self.log_event(event)

    async def log_penalty_event(
        self,
        match_id: str,
        actor_id: str,
        participant_id: str,
        penalty_level: int,
        reason: Optional[str] = None,
        **kwargs
    ) -> MatchEventResponse:
        """
        Convenience method for logging penalty events
        
        Args:
            match_id: ID of the match
            actor_id: ID of the referee
            participant_id: ID of the penalized participant
            penalty_level: Level/severity of the penalty
            reason: Optional reason for the penalty
            **kwargs: Additional metadata
            
        Returns:
            MatchEventResponse: The created event
        """
        metadata = create_penalty_metadata(
            penalty_level=penalty_level,
            reason=reason,
            **kwargs
        )
        
        event = MatchEventCreate(
            match_id=match_id,
            actor_id=actor_id,
            participant_id=participant_id,
            event_type=MatchEventType.PENALTY,
            value=str(penalty_level),
            metadata=metadata
        )
        
        return await self.log_event(event)

    async def log_comment_event(
        self,
        match_id: str,
        actor_id: str,
        comment_text: str,
        participant_id: Optional[str] = None,
        category: Optional[str] = None,
        **kwargs
    ) -> MatchEventResponse:
        """
        Convenience method for logging comment events
        
        Args:
            match_id: ID of the match
            actor_id: ID of the referee
            comment_text: The comment text
            participant_id: Optional participant the comment refers to
            category: Optional category/type of comment
            **kwargs: Additional metadata
            
        Returns:
            MatchEventResponse: The created event
        """
        metadata = create_comment_metadata(
            comment_text=comment_text,
            category=category,
            **kwargs
        )
        
        event = MatchEventCreate(
            match_id=match_id,
            actor_id=actor_id,
            participant_id=participant_id,
            event_type=MatchEventType.COMMENT,
            value=comment_text,
            metadata=metadata
        )
        
        return await self.log_event(event)

    async def log_state_change_event(
        self,
        match_id: str,
        actor_id: str,
        old_state: str,
        new_state: str,
        **kwargs
    ) -> MatchEventResponse:
        """
        Convenience method for logging state change events
        
        Args:
            match_id: ID of the match
            actor_id: ID of the referee/actor
            old_state: Previous match state
            new_state: New match state
            **kwargs: Additional metadata
            
        Returns:
            MatchEventResponse: The created event
        """
        # Determine the appropriate event type based on new state
        event_type_map = {
            "IN_PROGRESS": MatchEventType.START,
            "PAUSED": MatchEventType.STOP,
            "SCHEDULED": MatchEventType.RESET,
            "FINISHED": MatchEventType.STOP,
        }
        
        event_type = event_type_map.get(new_state, MatchEventType.STATE_CHANGE)
        
        metadata = create_state_change_metadata(
            old_state=old_state,
            new_state=new_state,
            **kwargs
        )
        
        event = MatchEventCreate(
            match_id=match_id,
            actor_id=actor_id,
            event_type=event_type,
            value=new_state,
            metadata=metadata
        )
        
        return await self.log_event(event)

    async def log_timer_event(
        self,
        match_id: str,
        actor_id: str,
        old_time: Optional[int],
        new_time: int,
        **kwargs
    ) -> MatchEventResponse:
        """
        Convenience method for logging timer update events
        
        Args:
            match_id: ID of the match
            actor_id: ID of the referee/actor
            old_time: Previous time remaining (seconds)
            new_time: New time remaining (seconds)
            **kwargs: Additional metadata
            
        Returns:
            MatchEventResponse: The created event
        """
        metadata = create_timer_metadata(
            old_time=old_time,
            new_time=new_time,
            **kwargs
        )
        
        event = MatchEventCreate(
            match_id=match_id,
            actor_id=actor_id,
            event_type=MatchEventType.TIMER_UPDATE,
            value=str(new_time),
            metadata=metadata
        )
        
        return await self.log_event(event)

    async def get_match_events(
        self,
        match_id: str,
        query_params: Optional[MatchEventsQuery] = None
    ) -> MatchEventsList:
        """
        Retrieve match events with optional filtering and pagination
        
        Args:
            match_id: ID of the match
            query_params: Optional filtering and pagination parameters
            
        Returns:
            MatchEventsList: List of events with metadata
            
        Raises:
            NotFoundError: If match doesn't exist
        """
        if not query_params:
            query_params = MatchEventsQuery()
        
        # Build base query
        query = self.db.query(MatchEventModel).filter(
            MatchEventModel.match_id == match_id
        )
        
        # Apply filters
        if query_params.event_type:
            query = query.filter(MatchEventModel.event_type == query_params.event_type)
        
        if query_params.actor_id:
            query = query.filter(MatchEventModel.actor_id == query_params.actor_id)
        
        if query_params.participant_id:
            query = query.filter(MatchEventModel.participant_id == query_params.participant_id)
        
        if query_params.start_time:
            query = query.filter(MatchEventModel.timestamp >= query_params.start_time)
        
        if query_params.end_time:
            query = query.filter(MatchEventModel.timestamp <= query_params.end_time)
        
        # Get total count
        total_count = query.count()
        
        # Apply ordering and pagination
        events = query.order_by(desc(MatchEventModel.timestamp))\
                     .offset(query_params.offset)\
                     .limit(query_params.limit)\
                     .all()
        
        # Convert to response models
        event_responses = [MatchEventResponse.from_orm(event) for event in events]
        
        return MatchEventsList(
            events=event_responses,
            total_count=total_count,
            match_id=match_id
        )

    async def get_match_events_with_details(
        self,
        match_id: str,
        query_params: Optional[MatchEventsQuery] = None
    ) -> List[MatchEventWithDetails]:
        """
        Retrieve match events with actor and participant details
        
        Args:
            match_id: ID of the match
            query_params: Optional filtering and pagination parameters
            
        Returns:
            List[MatchEventWithDetails]: Events with enriched details
        """
        # This would require joining with User table to get names
        # For now, returning basic events - would need to implement joins
        events_list = await self.get_match_events(match_id, query_params)
        
        # TODO: Implement joins to get actor names and participant names
        return [
            MatchEventWithDetails(**event.dict(), actor_name=None, participant_name=None)
            for event in events_list.events
        ]

    async def get_event_statistics(self, match_id: str) -> Dict[str, Any]:
        """
        Get comprehensive statistics about events in a match
        
        Args:
            match_id: ID of the match
            
        Returns:
            Dict containing various statistics about the match events
        """
        # Get all events for the match
        all_events = self.db.query(MatchEventModel).filter(
            MatchEventModel.match_id == match_id
        ).all()
        
        if not all_events:
            return {
                "total_events": 0,
                "event_types": {},
                "actors": {},
                "participants": {},
                "duration_analysis": {},
                "timeline": []
            }
        
        # Calculate statistics
        total_events = len(all_events)
        event_types = {}
        actors = {}
        participants = {}
        
        # Count by type, actor, and participant
        for event in all_events:
            # Event types
            event_type = event.event_type.value
            event_types[event_type] = event_types.get(event_type, 0) + 1
            
            # Actors
            actors[event.actor_id] = actors.get(event.actor_id, 0) + 1
            
            # Participants
            if event.participant_id:
                participants[event.participant_id] = participants.get(event.participant_id, 0) + 1
        
        # Duration analysis
        first_event = min(all_events, key=lambda x: x.timestamp)
        last_event = max(all_events, key=lambda x: x.timestamp)
        match_duration = (last_event.timestamp - first_event.timestamp).total_seconds()
        
        # Create timeline (last 10 events)
        recent_events = sorted(all_events, key=lambda x: x.timestamp, reverse=True)[:10]
        timeline = [
            {
                "timestamp": event.timestamp.isoformat(),
                "event_type": event.event_type.value,
                "actor_id": event.actor_id,
                "participant_id": event.participant_id
            }
            for event in recent_events
        ]
        
        return {
            "total_events": total_events,
            "event_types": event_types,
            "actors": actors,
            "participants": participants,
            "duration_analysis": {
                "match_duration_seconds": match_duration,
                "first_event": first_event.timestamp.isoformat(),
                "last_event": last_event.timestamp.isoformat(),
                "events_per_minute": round(total_events / (match_duration / 60), 2) if match_duration > 0 else 0
            },
            "timeline": timeline
        }

    async def export_match_events(
        self,
        match_id: str,
        format_type: str = "json"
    ) -> Dict[str, Any]:
        """
        Export match events in various formats
        
        Args:
            match_id: ID of the match
            format_type: Export format ('json' or 'pdf')
            
        Returns:
            Dict containing export data and metadata
        """
        # Get all events
        events_list = await self.get_match_events(match_id)
        statistics = await self.get_event_statistics(match_id)
        
        export_data = {
            "match_id": match_id,
            "export_timestamp": datetime.utcnow().isoformat(),
            "format": format_type,
            "events": [event.dict() for event in events_list.events],
            "statistics": statistics,
            "metadata": {
                "total_events": events_list.total_count,
                "export_generated_by": "match_event_service",
                "version": "1.0"
            }
        }
        
        if format_type == "json":
            return export_data
        elif format_type == "pdf":
            # TODO: Implement PDF generation
            # For now, return JSON with PDF placeholder
            export_data["pdf_url"] = f"/api/matches/{match_id}/events/export.pdf"
            return export_data
        else:
            raise ValidationError(f"Unsupported export format: {format_type}")

    async def delete_match_events(self, match_id: str, actor_id: str) -> int:
        """
        Delete all events for a match (admin operation)
        
        Args:
            match_id: ID of the match
            actor_id: ID of the user performing the deletion
            
        Returns:
            Number of events deleted
        """
        # Log the deletion event first
        await self.log_event(MatchEventCreate(
            match_id=match_id,
            actor_id=actor_id,
            event_type=MatchEventType.COMMENT,
            value="Event log cleared",
            metadata={"action": "delete_all_events", "reason": "administrative_action"}
        ))
        
        # Delete all events except the deletion log
        deleted_count = self.db.query(MatchEventModel).filter(
            and_(
                MatchEventModel.match_id == match_id,
                MatchEventModel.event_type != MatchEventType.COMMENT,
                MatchEventModel.value != "Event log cleared"
            )
        ).delete()
        
        self.db.commit()
        
        logger.warning(f"Deleted {deleted_count} events for match {match_id} by {actor_id}")
        
        return deleted_count 