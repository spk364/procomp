"""
WebSocket routes for the tournament platform
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from typing import Optional
import logging

from app.websockets.match_websocket import websocket_endpoint, get_match_connection_stats
from app.core.auth import get_current_user_websocket

logger = logging.getLogger(__name__)

router = APIRouter()

@router.websocket("/ws/match/{match_id}")
async def match_websocket_endpoint(
    websocket: WebSocket,
    match_id: str,
    role: Optional[str] = Query(None, description="Role: 'referee' for control access, otherwise view-only"),
):
    """
    WebSocket endpoint for real-time match updates
    
    Parameters:
    - match_id: The ID of the match to connect to
    - role: 'referee' for control access, otherwise view-only access
    
    Authentication:
    - Requires valid JWT token via query parameter: ?token=<jwt_token>
    - Or via WebSocket headers: Authorization: Bearer <jwt_token>
    
    Message Types (Referee -> Server):
    - SCORE_UPDATE: { type: "SCORE_UPDATE", matchId: string, data: { action: ScoreAction, participantId: string, timestamp: string } }
    - MATCH_STATE_UPDATE: { type: "MATCH_STATE_UPDATE", matchId: string, data: { state: MatchState } }
    - TIMER_UPDATE: { type: "TIMER_UPDATE", matchId: string, data: { timeRemaining: number } }
    - PING: { type: "PING" }
    
    Message Types (Server -> Client):
    - MATCH_UPDATE: { type: "MATCH_UPDATE", matchId: string, data: Match, timestamp: string }
    - TIMER_UPDATE: { type: "TIMER_UPDATE", matchId: string, data: { timeRemaining: number }, timestamp: string }
    - CONNECTION_STATUS: { type: "CONNECTION_STATUS", matchId: string, data: { connected: boolean, clientCount: number }, timestamp: string }
    - ERROR: { type: "ERROR", error: string, timestamp: string }
    - PONG: { type: "PONG", timestamp: string }
    """
    
    await websocket_endpoint(websocket, match_id, role)

@router.get("/ws/match/{match_id}/stats")
async def get_match_websocket_stats(
    match_id: str,
    current_user = Depends(get_current_user_websocket)
):
    """
    Get WebSocket connection statistics for a match
    Requires authentication
    """
    stats = await get_match_connection_stats(match_id)
    return {
        "matchId": match_id,
        "connections": stats,
        "timestamp": "2024-01-01T00:00:00Z"  # Use actual timestamp
    } 