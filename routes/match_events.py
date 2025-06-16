"""
REST API routes for Match Event Log system
Provides endpoints for retrieving match events and exporting data
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Path
from fastapi.responses import JSONResponse
from typing import Optional, List
from datetime import datetime
import logging

from services.match_event_service import MatchEventService
from app.models.match_event import (
    MatchEventResponse, MatchEventsList, MatchEventsQuery,
    MatchEventType, MatchEventWithDetails
)
from app.core.auth import get_current_user
from app.core.database import get_db
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/matches", tags=["Match Events"])

# Dependency injection
async def get_match_event_service(db: Session = Depends(get_db)) -> MatchEventService:
    """Get match event service with database session"""
    return MatchEventService(db)

@router.get(
    "/{match_id}/events",
    response_model=MatchEventsList,
    summary="Get Match Events",
    description="Retrieve all events for a specific match with optional filtering and pagination"
)
async def get_match_events(
    match_id: str = Path(..., description="Match ID to retrieve events for"),
    event_type: Optional[MatchEventType] = Query(None, description="Filter by event type"),
    actor_id: Optional[str] = Query(None, description="Filter by actor/referee ID"),
    participant_id: Optional[str] = Query(None, description="Filter by participant ID"),
    start_time: Optional[datetime] = Query(None, description="Filter events after this timestamp"),
    end_time: Optional[datetime] = Query(None, description="Filter events before this timestamp"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of events to return"),
    offset: int = Query(0, ge=0, description="Number of events to skip for pagination"),
    current_user = Depends(get_current_user),
    service: MatchEventService = Depends(get_match_event_service)
) -> MatchEventsList:
    """
    Get all events for a specific match with optional filtering and pagination.
    
    **Authentication Required**: Valid JWT token
    
    **Query Parameters**:
    - `event_type`: Filter by specific event type (POINTS_2, PENALTY, etc.)
    - `actor_id`: Filter by referee/actor who performed the action
    - `participant_id`: Filter by participant involved in the event
    - `start_time`: ISO datetime string to filter events after
    - `end_time`: ISO datetime string to filter events before
    - `limit`: Maximum events to return (1-1000, default: 100)
    - `offset`: Skip number of events for pagination (default: 0)
    
    **Returns**: Paginated list of match events with metadata
    """
    try:
        # Build query parameters
        query_params = MatchEventsQuery(
            event_type=event_type,
            actor_id=actor_id,
            participant_id=participant_id,
            start_time=start_time,
            end_time=end_time,
            limit=limit,
            offset=offset
        )
        
        # Retrieve events
        events_list = await service.get_match_events(match_id, query_params)
        
        logger.info(f"Retrieved {len(events_list.events)} events for match {match_id} by user {current_user.get('user_id', 'unknown')}")
        
        return events_list
        
    except Exception as e:
        logger.error(f"Failed to retrieve events for match {match_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve match events: {str(e)}"
        )

@router.get(
    "/{match_id}/events/detailed",
    response_model=List[MatchEventWithDetails],
    summary="Get Match Events with Details",
    description="Retrieve match events with actor and participant names for enhanced display"
)
async def get_match_events_with_details(
    match_id: str = Path(..., description="Match ID to retrieve events for"),
    event_type: Optional[MatchEventType] = Query(None, description="Filter by event type"),
    actor_id: Optional[str] = Query(None, description="Filter by actor/referee ID"),
    participant_id: Optional[str] = Query(None, description="Filter by participant ID"),
    start_time: Optional[datetime] = Query(None, description="Filter events after this timestamp"),
    end_time: Optional[datetime] = Query(None, description="Filter events before this timestamp"),
    limit: int = Query(50, ge=1, le=500, description="Maximum number of events to return"),
    offset: int = Query(0, ge=0, description="Number of events to skip for pagination"),
    current_user = Depends(get_current_user),
    service: MatchEventService = Depends(get_match_event_service)
) -> List[MatchEventWithDetails]:
    """
    Get match events with enriched details including actor and participant names.
    
    **Authentication Required**: Valid JWT token
    
    **Returns**: List of events with additional name information for display
    """
    try:
        # Build query parameters
        query_params = MatchEventsQuery(
            event_type=event_type,
            actor_id=actor_id,
            participant_id=participant_id,
            start_time=start_time,
            end_time=end_time,
            limit=limit,
            offset=offset
        )
        
        # Retrieve events with details
        events_with_details = await service.get_match_events_with_details(match_id, query_params)
        
        logger.info(f"Retrieved {len(events_with_details)} detailed events for match {match_id}")
        
        return events_with_details
        
    except Exception as e:
        logger.error(f"Failed to retrieve detailed events for match {match_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve detailed match events: {str(e)}"
        )

@router.get(
    "/{match_id}/events/statistics",
    summary="Get Match Event Statistics",
    description="Get comprehensive statistics and analytics for match events"
)
async def get_match_event_statistics(
    match_id: str = Path(..., description="Match ID to get statistics for"),
    current_user = Depends(get_current_user),
    service: MatchEventService = Depends(get_match_event_service)
):
    """
    Get comprehensive statistics about events in a match.
    
    **Authentication Required**: Valid JWT token
    
    **Returns**: Dictionary containing:
    - Total event counts
    - Event type breakdown
    - Actor activity summary
    - Participant involvement
    - Duration analysis
    - Recent event timeline
    """
    try:
        statistics = await service.get_event_statistics(match_id)
        
        logger.info(f"Retrieved event statistics for match {match_id}")
        
        return {
            "match_id": match_id,
            "statistics": statistics,
            "generated_at": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Failed to get statistics for match {match_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve event statistics: {str(e)}"
        )

@router.get(
    "/{match_id}/events/export",
    summary="Export Match Events",
    description="Export match events in JSON or PDF format"
)
async def export_match_events(
    match_id: str = Path(..., description="Match ID to export events for"),
    format: str = Query("json", regex="^(json|pdf)$", description="Export format: 'json' or 'pdf'"),
    current_user = Depends(get_current_user),
    service: MatchEventService = Depends(get_match_event_service)
):
    """
    Export all match events in the specified format.
    
    **Authentication Required**: Valid JWT token
    
    **Query Parameters**:
    - `format`: Export format ('json' or 'pdf')
    
    **Returns**: 
    - For JSON: Complete event data with metadata
    - For PDF: JSON response with PDF download URL (TODO: implement PDF generation)
    """
    try:
        export_data = await service.export_match_events(match_id, format)
        
        logger.info(f"Exported events for match {match_id} in {format} format by user {current_user.get('user_id', 'unknown')}")
        
        if format == "json":
            return JSONResponse(
                content=export_data,
                headers={
                    "Content-Disposition": f"attachment; filename=match_{match_id}_events.json"
                }
            )
        else:  # PDF format
            return {
                "message": f"PDF export prepared for match {match_id}",
                "download_url": export_data.get("pdf_url"),
                "export_data": export_data
            }
            
    except Exception as e:
        logger.error(f"Failed to export events for match {match_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to export match events: {str(e)}"
        )

@router.get(
    "/{match_id}/events/timeline",
    summary="Get Match Event Timeline",
    description="Get a chronological timeline of match events optimized for visualization"
)
async def get_match_event_timeline(
    match_id: str = Path(..., description="Match ID to get timeline for"),
    limit: int = Query(200, ge=1, le=1000, description="Maximum number of events in timeline"),
    current_user = Depends(get_current_user),
    service: MatchEventService = Depends(get_match_event_service)
):
    """
    Get a chronological timeline of match events optimized for frontend visualization.
    
    **Authentication Required**: Valid JWT token
    
    **Returns**: Timeline data structure with events grouped by time periods
    """
    try:
        # Get events ordered by timestamp
        query_params = MatchEventsQuery(limit=limit, offset=0)
        events_list = await service.get_match_events(match_id, query_params)
        
        # Transform into timeline format
        timeline = []
        for event in reversed(events_list.events):  # Chronological order
            timeline.append({
                "id": event.id,
                "timestamp": event.timestamp.isoformat(),
                "event_type": event.event_type.value,
                "actor_id": event.actor_id,
                "participant_id": event.participant_id,
                "value": event.value,
                "summary": _generate_event_summary(event),
                "metadata": event.metadata
            })
        
        logger.info(f"Generated timeline with {len(timeline)} events for match {match_id}")
        
        return {
            "match_id": match_id,
            "timeline": timeline,
            "total_events": events_list.total_count,
            "generated_at": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Failed to generate timeline for match {match_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate event timeline: {str(e)}"
        )

@router.delete(
    "/{match_id}/events",
    summary="Delete Match Events",
    description="Delete all events for a match (admin operation)"
)
async def delete_match_events(
    match_id: str = Path(..., description="Match ID to delete events for"),
    current_user = Depends(get_current_user),
    service: MatchEventService = Depends(get_match_event_service)
):
    """
    Delete all events for a match. This is an administrative operation.
    
    **Authentication Required**: Admin role required
    
    **Warning**: This operation cannot be undone!
    """
    try:
        # Check if user has admin privileges
        user_roles = current_user.get("roles", [])
        if "admin" not in [role.lower() for role in user_roles]:
            raise HTTPException(
                status_code=403,
                detail="Admin privileges required for this operation"
            )
        
        user_id = current_user.get("user_id")
        deleted_count = await service.delete_match_events(match_id, user_id)
        
        logger.warning(f"Admin {user_id} deleted {deleted_count} events for match {match_id}")
        
        return {
            "message": f"Successfully deleted {deleted_count} events for match {match_id}",
            "deleted_count": deleted_count,
            "match_id": match_id,
            "deleted_by": user_id,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except HTTPException:
        raise  # Re-raise HTTP exceptions as-is
    except Exception as e:
        logger.error(f"Failed to delete events for match {match_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete match events: {str(e)}"
        )

# Helper functions
def _generate_event_summary(event: MatchEventResponse) -> str:
    """Generate a human-readable summary for an event"""
    event_summaries = {
        "POINTS_2": f"2 points awarded",
        "ADVANTAGE": f"Advantage awarded", 
        "PENALTY": f"Penalty given (Level {event.value or 'Unknown'})",
        "SUBMISSION": f"Submission recorded",
        "START": f"Match started",
        "STOP": f"Match stopped/paused",
        "RESET": f"Match reset",
        "COMMENT": f"Comment: {event.value or 'No comment'}",
        "STATE_CHANGE": f"State changed to {event.value}",
        "TIMER_UPDATE": f"Timer updated to {event.value}s",
        "AUTO_FINISH": f"Match automatically finished"
    }
    
    return event_summaries.get(event.event_type.value, f"Event: {event.event_type.value}")

# Health check endpoint
@router.get(
    "/events/health",
    summary="Event System Health Check",
    description="Check if the match event logging system is operational"
)
async def health_check(
    service: MatchEventService = Depends(get_match_event_service)
):
    """
    Health check endpoint for the match event logging system.
    
    **No Authentication Required**
    
    **Returns**: System status and basic metrics
    """
    try:
        # Basic database connectivity test could go here
        return {
            "status": "healthy",
            "service": "match_event_service",
            "timestamp": datetime.utcnow().isoformat(),
            "version": "1.0"
        }
        
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        raise HTTPException(
            status_code=503,
            detail=f"Service unhealthy: {str(e)}"
        ) 