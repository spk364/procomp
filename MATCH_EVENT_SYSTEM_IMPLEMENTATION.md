# Match Event Log System - Implementation Guide

## 🎯 Overview

This document describes the complete **Match Event Log System** implementation for the martial arts tournament platform. The system provides comprehensive logging of all referee actions during matches, with a clean service-oriented architecture.

## 📋 Components Implemented

### 1. Database Model (`apps/api/app/models/match_event.py`)

**Enhanced MatchEvent Model** with the following fields:
- `id` - Unique event identifier  
- `match_id` - Foreign key to match
- `timestamp` - Event occurrence time
- `actor_id` - Referee/user who performed action
- `participant_id` - Optional participant involved
- `event_type` - Enum: `POINTS_2`, `ADVANTAGE`, `PENALTY`, `SUBMISSION`, `START`, `STOP`, `RESET`, `COMMENT`
- `value` - Optional string value (penalty level, comment text, etc.)
- `metadata` - JSONB field for additional event data

**Enums & Types:**
```python
class MatchEventType(str, Enum):
    POINTS_2 = "POINTS_2"
    ADVANTAGE = "ADVANTAGE"
    PENALTY = "PENALTY"
    SUBMISSION = "SUBMISSION"
    START = "START"
    STOP = "STOP"
    RESET = "RESET"
    COMMENT = "COMMENT"
    # System events
    MATCH_CREATED = "MATCH_CREATED"
    STATE_CHANGE = "STATE_CHANGE"
    TIMER_UPDATE = "TIMER_UPDATE"
    AUTO_FINISH = "AUTO_FINISH"
```

### 2. Service Layer (`services/match_event_service.py`)

**MatchEventService** provides comprehensive async operations:

#### Core Functions:
- `log_event(event)` → Async DB insert with validation
- `get_match_events(match_id)` → Paginated event retrieval with filtering
- `get_event_statistics(match_id)` → Comprehensive analytics
- `export_match_events(match_id, format)` → JSON/PDF export

#### Convenience Methods:
- `log_score_event()` - Scoring actions with metadata
- `log_penalty_event()` - Penalty tracking with severity levels
- `log_comment_event()` - Referee comments and notes
- `log_state_change_event()` - Match state transitions
- `log_timer_event()` - Timer updates and time management

#### Advanced Features:
- **Query filtering** by event type, actor, participant, time range
- **Pagination** with limit/offset
- **Statistics** including event counts, duration analysis, timelines
- **Export** in JSON format (PDF generation ready)
- **Admin operations** for event log management

### 3. REST API Routes (`routes/match_events.py`)

**Comprehensive API Endpoints:**

```bash
GET /matches/{id}/events              # Get match events (paginated, filtered)
GET /matches/{id}/events/detailed     # Events with actor/participant names  
GET /matches/{id}/events/statistics   # Event analytics and metrics
GET /matches/{id}/events/export       # Export in JSON/PDF format
GET /matches/{id}/events/timeline     # Timeline optimized for visualization
DELETE /matches/{id}/events           # Admin: Clear event log
GET /events/health                    # System health check
```

**Query Parameters:**
- `event_type` - Filter by event type
- `actor_id` - Filter by referee
- `participant_id` - Filter by participant
- `start_time` / `end_time` - Time range filtering
- `limit` / `offset` - Pagination
- `format` - Export format selection

### 4. WebSocket Integration

**Automatic Event Logging** in real-time:
- All referee WebSocket messages are automatically logged
- Score updates, state changes, timer updates are captured
- Maintains audit trail of all referee interactions
- Provides context through message metadata

### 5. Database Schema Updates

**Prisma Schema** enhanced with:
```prisma
model MatchEvent {
  id            String   @id @default(cuid())
  matchId       String   @map("match_id")
  timestamp     DateTime @default(now())
  actorId       String   @map("actor_id")
  participantId String?  @map("participant_id")
  eventType     String   @map("event_type")
  value         String?
  metadata      Json?
  
  // Relationships
  match         Match    @relation(fields: [matchId], references: [id], onDelete: Cascade)
  actor         User     @relation("MatchEventActor", fields: [actorId], references: [id])
  
  @@index([matchId])
  @@index([timestamp])
  @@index([eventType])
  @@map("match_events")
}
```

## 🔧 Setup Instructions

### 1. Database Migration
```bash
cd packages/db
npx prisma db push
# or
npx prisma migrate dev --name add_match_events
```

### 2. Install Dependencies
Ensure your FastAPI app has:
- `sqlalchemy` (async support)
- `pydantic` 
- `fastapi`
- `python-jose` (for JWT auth)

### 3. Import the New Services
Update your main FastAPI app to include:
```python
from services.match_event_service import MatchEventService
from routes.match_events import router as match_events_router

app.include_router(match_events_router)
```

## 🚀 Usage Examples

### 1. Log a Scoring Event
```python
service = MatchEventService()

await service.log_score_event(
    match_id="match_123",
    actor_id="referee_456", 
    participant_id="fighter_789",
    event_type=MatchEventType.POINTS_2,
    old_score={"points": 0, "advantages": 1, "penalties": 0},
    new_score={"points": 2, "advantages": 1, "penalties": 0}
)
```

### 2. Get Match Events (API)
```bash
GET /matches/match_123/events?event_type=PENALTY&limit=50
```

### 3. Export Match Data
```bash
GET /matches/match_123/events/export?format=json
```

### 4. Get Event Statistics
```bash
GET /matches/match_123/events/statistics
```

Response includes:
- Total event counts by type
- Actor activity summary
- Duration analysis
- Recent event timeline

## 📊 Event Analytics

The system automatically calculates:
- **Event frequency** - Events per minute
- **Actor activity** - Referee action patterns  
- **Match flow** - State transition timeline
- **Scoring patterns** - Point/penalty distribution
- **Duration metrics** - Match length analysis

## 🔒 Security & Access Control

- **Authentication required** for all endpoints
- **Role-based access** (Admin privileges for deletion)
- **Audit logging** for all administrative actions
- **Data validation** with Pydantic models
- **SQL injection protection** via SQLAlchemy ORM

## 🎯 Integration Points

The system integrates seamlessly with:
1. **Existing Match Service** - Automatic event logging on all match operations
2. **WebSocket System** - Real-time referee action capture
3. **Authentication System** - JWT-based access control
4. **Tournament Management** - Full audit trail for matches
5. **Frontend Applications** - RESTful API for event display

## 🔄 Automatic Event Logging

All these actions trigger automatic event logging:
- Match creation/updates
- Score changes (points, advantages, penalties)
- State transitions (start, pause, stop, finish)
- Timer updates
- Referee assignments
- System-triggered actions (auto-finish, timeouts)

## 📈 Performance Considerations

- **Database indexing** on match_id, timestamp, event_type
- **Pagination** for large event logs
- **Async operations** for non-blocking performance
- **Connection pooling** via SQLAlchemy
- **Query optimization** with selective field loading

## 🧪 Testing

The implementation includes:
- **Comprehensive error handling** with appropriate HTTP status codes
- **Input validation** via Pydantic models
- **Database transaction management** with rollback support
- **Logging** at appropriate levels for debugging and monitoring

## 🚀 Production Deployment

For production use:
1. Set up proper database connection pooling
2. Configure logging levels appropriately  
3. Set up monitoring for the `/events/health` endpoint
4. Consider implementing event log archival for long-term storage
5. Set up database backups including event data

---

## ✅ Verification Checklist

- [x] MatchEvent database model with all required fields
- [x] Comprehensive service layer with async operations  
- [x] REST API endpoints for event retrieval and export
- [x] WebSocket integration for real-time logging
- [x] Database schema updates with proper relationships
- [x] Query filtering and pagination support
- [x] Event statistics and analytics
- [x] Export functionality (JSON, PDF-ready)
- [x] Authentication and authorization
- [x] Comprehensive error handling
- [x] Production-ready architecture

The Match Event Log system is now fully implemented and ready for production use! 🎉 