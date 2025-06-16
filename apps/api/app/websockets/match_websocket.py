"""
WebSocket endpoint for real-time match updates
Handles referee inputs and broadcasts to HUD consumers
"""

from fastapi import WebSocket, WebSocketDisconnect, HTTPException, Depends, Query
from typing import Dict, List, Optional, Set
import json
import asyncio
import logging
from datetime import datetime
from pydantic import BaseModel, ValidationError

from app.core.auth import get_current_user_websocket
from app.models.match import Match, MatchState, ScoreAction
from app.models.match_event import MatchEventType, MatchEventCreate
from app.services.match_service import MatchService
from services.match_event_service import MatchEventService

logger = logging.getLogger(__name__)

class WebSocketMessage(BaseModel):
    type: str
    matchId: str
    data: dict
    timestamp: str

class ScoreUpdate(BaseModel):
    action: ScoreAction
    participantId: str
    timestamp: str

class ConnectionManager:
    """Manages WebSocket connections for match updates"""
    
    def __init__(self):
        # Structure: {match_id: {"referees": set, "viewers": set}}
        self.connections: Dict[str, Dict[str, Set[WebSocket]]] = {}
        self.user_connections: Dict[WebSocket, Dict[str, str]] = {}  # websocket -> {user_id, role, match_id}

    async def connect(self, websocket: WebSocket, match_id: str, user_id: str, role: str = "viewer"):
        """Add a new WebSocket connection"""
        await websocket.accept()
        
        # Initialize match connections if not exists
        if match_id not in self.connections:
            self.connections[match_id] = {"referees": set(), "viewers": set()}
        
        # Add to appropriate group
        group = "referees" if role == "referee" else "viewers"
        self.connections[match_id][group].add(websocket)
        
        # Track user info for this connection
        self.user_connections[websocket] = {
            "user_id": user_id,
            "role": role,
            "match_id": match_id
        }
        
        # Send connection status update
        await self.broadcast_connection_status(match_id)
        
        logger.info(f"User {user_id} ({role}) connected to match {match_id}")

    async def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection"""
        if websocket in self.user_connections:
            user_info = self.user_connections[websocket]
            match_id = user_info["match_id"]
            role = user_info["role"]
            
            # Remove from appropriate group
            group = "referees" if role == "referee" else "viewers"
            if match_id in self.connections:
                self.connections[match_id][group].discard(websocket)
                
                # Clean up empty match connections
                if (not self.connections[match_id]["referees"] and 
                    not self.connections[match_id]["viewers"]):
                    del self.connections[match_id]
            
            del self.user_connections[websocket]
            
            # Send updated connection status
            if match_id in self.connections:
                await self.broadcast_connection_status(match_id)
            
            logger.info(f"User {user_info['user_id']} ({role}) disconnected from match {match_id}")

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        """Send a message to a specific WebSocket"""
        try:
            await websocket.send_text(json.dumps(message))
        except Exception as e:
            logger.error(f"Failed to send personal message: {e}")

    async def broadcast_to_match(self, message: dict, match_id: str, exclude_websocket: Optional[WebSocket] = None):
        """Broadcast a message to all connections in a match"""
        if match_id not in self.connections:
            return
        
        # Get all connections for this match
        all_connections = (
            self.connections[match_id]["referees"] | 
            self.connections[match_id]["viewers"]
        )
        
        # Send to all connections except the excluded one
        disconnected = []
        for websocket in all_connections:
            if websocket != exclude_websocket:
                try:
                    await websocket.send_text(json.dumps(message))
                except Exception as e:
                    logger.error(f"Failed to broadcast message: {e}")
                    disconnected.append(websocket)
        
        # Clean up disconnected websockets
        for websocket in disconnected:
            await self.disconnect(websocket)

    async def broadcast_connection_status(self, match_id: str):
        """Broadcast connection status to all clients in a match"""
        if match_id not in self.connections:
            return
        
        total_clients = (
            len(self.connections[match_id]["referees"]) + 
            len(self.connections[match_id]["viewers"])
        )
        
        message = {
            "type": "CONNECTION_STATUS",
            "matchId": match_id,
            "data": {
                "connected": True,
                "clientCount": total_clients,
                "refereeCount": len(self.connections[match_id]["referees"]),
                "viewerCount": len(self.connections[match_id]["viewers"])
            },
            "timestamp": datetime.utcnow().isoformat()
        }
        
        await self.broadcast_to_match(message, match_id)

    def get_match_stats(self, match_id: str) -> dict:
        """Get connection statistics for a match"""
        if match_id not in self.connections:
            return {"refereeCount": 0, "viewerCount": 0, "totalCount": 0}
        
        referee_count = len(self.connections[match_id]["referees"])
        viewer_count = len(self.connections[match_id]["viewers"])
        
        return {
            "refereeCount": referee_count,
            "viewerCount": viewer_count,
            "totalCount": referee_count + viewer_count
        }

# Global connection manager instance
manager = ConnectionManager()

class MatchWebSocketHandler:
    """Handles WebSocket logic for match updates"""
    
    def __init__(self, match_service: MatchService):
        self.match_service = match_service
        self.event_service = MatchEventService()

    async def handle_referee_message(self, websocket: WebSocket, message: WebSocketMessage, user_id: str):
        """Handle messages from referee clients"""
        try:
            match_id = message.matchId
            
            # Log all referee actions for comprehensive event tracking
            await self.event_service.log_comment_event(
                match_id=match_id,
                actor_id=user_id,
                comment_text=f"Referee action: {message.type}",
                category="websocket_action",
                message_type=message.type,
                message_data=message.data
            )
            
            if message.type == "SCORE_UPDATE":
                # Validate score update
                score_update = ScoreUpdate(**message.data)
                
                # Apply score update to match
                updated_match = await self.match_service.apply_score_action(
                    match_id, 
                    score_update.action, 
                    score_update.participantId,
                    user_id
                )
                
                # Broadcast updated match to all clients
                broadcast_message = {
                    "type": "MATCH_UPDATE",
                    "matchId": match_id,
                    "data": updated_match.dict(),
                    "timestamp": datetime.utcnow().isoformat()
                }
                
                await manager.broadcast_to_match(broadcast_message, match_id)
                
            elif message.type == "MATCH_STATE_UPDATE":
                # Update match state
                new_state = MatchState(message.data["state"])
                updated_match = await self.match_service.update_match_state(
                    match_id, 
                    new_state, 
                    user_id
                )
                
                # Broadcast updated match
                broadcast_message = {
                    "type": "MATCH_UPDATE",
                    "matchId": match_id,
                    "data": updated_match.dict(),
                    "timestamp": datetime.utcnow().isoformat()
                }
                
                await manager.broadcast_to_match(broadcast_message, match_id)
                
            elif message.type == "TIMER_UPDATE":
                # Update match timer
                time_remaining = message.data["timeRemaining"]
                await self.match_service.update_match_timer(match_id, time_remaining, user_id)
                
                # Broadcast timer update
                broadcast_message = {
                    "type": "TIMER_UPDATE",
                    "matchId": match_id,
                    "data": {"timeRemaining": time_remaining},
                    "timestamp": datetime.utcnow().isoformat()
                }
                
                await manager.broadcast_to_match(broadcast_message, match_id)
                
        except ValidationError as e:
            await manager.send_personal_message({
                "type": "ERROR",
                "error": f"Invalid message format: {e}",
                "timestamp": datetime.utcnow().isoformat()
            }, websocket)
            
        except Exception as e:
            logger.error(f"Error handling referee message: {e}")
            await manager.send_personal_message({
                "type": "ERROR", 
                "error": "Failed to process message",
                "timestamp": datetime.utcnow().isoformat()
            }, websocket)

    async def handle_heartbeat(self, websocket: WebSocket, message_type: str):
        """Handle heartbeat messages"""
        if message_type == "PING":
            await manager.send_personal_message({
                "type": "PONG",
                "timestamp": datetime.utcnow().isoformat()
            }, websocket)

# Initialize handler (will be injected with dependencies)
websocket_handler = None

async def get_match_websocket_handler() -> MatchWebSocketHandler:
    """Dependency injection for WebSocket handler"""
    global websocket_handler
    if websocket_handler is None:
        match_service = MatchService()  # Initialize your match service
        websocket_handler = MatchWebSocketHandler(match_service)
    return websocket_handler

async def websocket_endpoint(
    websocket: WebSocket, 
    match_id: str,
    role: Optional[str] = Query(None),
    current_user = Depends(get_current_user_websocket),
    handler: MatchWebSocketHandler = Depends(get_match_websocket_handler)
):
    """
    WebSocket endpoint for match updates
    
    - match_id: The ID of the match to connect to
    - role: 'referee' for control access, None/other for view-only
    - Requires authentication via WebSocket token
    """
    
    try:
        # Determine user role
        user_role = "referee" if role == "referee" and current_user.role == "referee" else "viewer"
        
        # Connect to match
        await manager.connect(websocket, match_id, current_user.id, user_role)
        
        # Send initial match data
        try:
            match = await handler.match_service.get_match(match_id)
            if match:
                initial_message = {
                    "type": "MATCH_UPDATE",
                    "matchId": match_id,
                    "data": match.dict(),
                    "timestamp": datetime.utcnow().isoformat()
                }
                await manager.send_personal_message(initial_message, websocket)
            else:
                await manager.send_personal_message({
                    "type": "ERROR",
                    "error": "Match not found",
                    "timestamp": datetime.utcnow().isoformat()
                }, websocket)
                return
                
        except Exception as e:
            logger.error(f"Failed to send initial match data: {e}")
        
        # Message handling loop
        while True:
            try:
                # Receive message
                data = await websocket.receive_text()
                raw_message = json.loads(data)
                
                # Handle heartbeat
                if raw_message.get("type") in ["PING", "PONG"]:
                    await handler.handle_heartbeat(websocket, raw_message["type"])
                    continue
                
                # Validate message format
                try:
                    message = WebSocketMessage(**raw_message)
                except ValidationError as e:
                    await manager.send_personal_message({
                        "type": "ERROR",
                        "error": f"Invalid message format: {e}",
                        "timestamp": datetime.utcnow().isoformat()
                    }, websocket)
                    continue
                
                # Only referees can send control messages
                if user_role == "referee" and message.type in [
                    "SCORE_UPDATE", "MATCH_STATE_UPDATE", "TIMER_UPDATE"
                ]:
                    await handler.handle_referee_message(websocket, message, current_user.id)
                elif user_role != "referee":
                    await manager.send_personal_message({
                        "type": "ERROR",
                        "error": "Insufficient permissions",
                        "timestamp": datetime.utcnow().isoformat()
                    }, websocket)
                
            except WebSocketDisconnect:
                break
            except json.JSONDecodeError:
                await manager.send_personal_message({
                    "type": "ERROR",
                    "error": "Invalid JSON format",
                    "timestamp": datetime.utcnow().isoformat()
                }, websocket)
            except Exception as e:
                logger.error(f"Error in WebSocket message loop: {e}")
                await manager.send_personal_message({
                    "type": "ERROR",
                    "error": "Internal server error",
                    "timestamp": datetime.utcnow().isoformat()
                }, websocket)
                
    except Exception as e:
        logger.error(f"WebSocket connection error: {e}")
    finally:
        await manager.disconnect(websocket)

# Utility function to get match connection stats (for admin/monitoring)
async def get_match_connection_stats(match_id: str) -> dict:
    """Get connection statistics for a specific match"""
    return manager.get_match_stats(match_id)

# Utility function to broadcast system message to match
async def broadcast_system_message(match_id: str, message: str, message_type: str = "SYSTEM"):
    """Broadcast a system message to all clients in a match"""
    broadcast_message = {
        "type": message_type,
        "matchId": match_id,
        "data": {"message": message},
        "timestamp": datetime.utcnow().isoformat()
    }
    await manager.broadcast_to_match(broadcast_message, match_id) 