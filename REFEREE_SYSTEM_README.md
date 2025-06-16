# Real-Time Referee Interface System

A comprehensive real-time tournament platform for martial arts competitions built with Next.js 14, FastAPI, and WebSockets.

## 🎯 Features

### Referee Panel
- **Real-time scoring**: +2 points, advantages, penalties, submissions
- **Match control**: Start, pause, stop, reset matches
- **Live timer**: Automatic countdown with visual progress
- **Connection monitoring**: WebSocket status and client count
- **Auto-finish**: Matches end automatically on submission or 3+ penalties
- **Role-based access**: Only authenticated referees can control matches

### HUD Overlay
- **OBS-ready**: Designed for streaming overlay integration
- **Minimal design**: Clean, readable display for broadcast
- **Real-time updates**: Instant score and state synchronization
- **Responsive layout**: Works on various screen sizes
- **Connection indicators**: Visual feedback for stream reliability

### Backend System
- **WebSocket API**: Real-time bidirectional communication
- **Event logging**: Complete audit trail of all match events
- **State validation**: Prevents invalid transitions and actions
- **Auto-scaling**: Connection manager handles multiple concurrent matches
- **Authentication**: Secure role-based access control

## 🏗️ Architecture

```
┌─────────────────┐    WebSocket    ┌─────────────────┐
│  Referee Panel  │ ←─────────────→ │                 │
│ /referee/[id]   │                 │   FastAPI       │
└─────────────────┘                 │   Backend       │
                                    │                 │
┌─────────────────┐    WebSocket    │                 │
│   HUD Overlay   │ ←─────────────→ │  - Match API    │
│   /hud/[id]     │   (read-only)   │  - WebSocket    │
└─────────────────┘                 │  - Event Log    │
                                    │  - Auth         │
┌─────────────────┐                 │                 │
│   Spectators    │ ←───────────────┤                 │
│  (Future)       │                 └─────────────────┘
└─────────────────┘
```

## 🚀 Quick Start

### 1. Backend Setup (FastAPI)

```bash
cd apps/api

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env with your database and auth settings

# Run migrations
alembic upgrade head

# Start the server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Frontend Setup (Next.js)

```bash
cd apps/web

# Install dependencies
npm install

# Set up environment variables
cp .env.local.example .env.local
# Edit .env.local with your API and Supabase settings

# Start development server
npm run dev
```

### 3. Environment Variables

#### Backend (.env)
```env
DATABASE_URL=postgresql://user:password@localhost/tournament_db
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
JWT_SECRET=your-jwt-secret
CORS_ORIGINS=http://localhost:3000,https://your-domain.com
```

#### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## 📡 WebSocket API Reference

### Connection Endpoint
```
ws://localhost:8000/ws/match/{match_id}?role=referee
```

### Authentication
- **Query Parameter**: `?token=<jwt_token>`
- **Header**: `Authorization: Bearer <jwt_token>`
- **Roles**: `referee` (control access) or `viewer` (read-only)

### Message Types

#### Client → Server (Referee Only)
```typescript
// Update score
{
  type: "SCORE_UPDATE",
  matchId: string,
  data: {
    action: "POINTS_2" | "ADVANTAGE" | "PENALTY" | "SUBMISSION",
    participantId: string,
    timestamp: string
  }
}

// Change match state
{
  type: "MATCH_STATE_UPDATE",
  matchId: string,
  data: {
    state: "SCHEDULED" | "IN_PROGRESS" | "PAUSED" | "FINISHED"
  }
}

// Update timer
{
  type: "TIMER_UPDATE",
  matchId: string,
  data: {
    timeRemaining: number
  }
}

// Heartbeat
{
  type: "PING"
}
```

#### Server → Client
```typescript
// Full match update
{
  type: "MATCH_UPDATE",
  matchId: string,
  data: Match,
  timestamp: string
}

// Timer update
{
  type: "TIMER_UPDATE",
  matchId: string,
  data: { timeRemaining: number },
  timestamp: string
}

// Connection status
{
  type: "CONNECTION_STATUS",
  matchId: string,
  data: { 
    connected: boolean, 
    clientCount: number,
    refereeCount: number,
    viewerCount: number
  },
  timestamp: string
}

// Error message
{
  type: "ERROR",
  error: string,
  timestamp: string
}

// Heartbeat response
{
  type: "PONG",
  timestamp: string
}
```

## 🎮 Usage Guide

### For Referees

1. **Login**: Navigate to `/auth/login` with referee credentials
2. **Access Match**: Go to `/referee/{match_id}`
3. **Control Match**:
   - Click **Start** to begin the match
   - Use score buttons to award points, advantages, penalties
   - **Submission** button immediately ends the match
   - **Pause/Resume** for breaks
   - **End Match** to finish manually

### For Streaming (OBS)

1. **Add Browser Source** in OBS
2. **URL**: `https://your-domain.com/hud/{match_id}`
3. **Dimensions**: 1920x1080 (or your stream resolution)
4. **Custom CSS** (optional):
   ```css
   body { 
     background: transparent !important;
     margin: 0;
   }
   ```

### Match Rules (Auto-Implementation)

- **Submission**: Match ends immediately, winner determined
- **3+ Penalties**: Disqualification, opponent wins
- **Time Expires**: Winner by points → advantages → fewer penalties
- **State Validation**: Prevents invalid transitions (e.g., pausing a finished match)

## 🔒 Security Features

### Authentication
- **JWT-based**: Secure token authentication via Supabase
- **Role validation**: Referee role required for control access
- **Session management**: Automatic token refresh

### WebSocket Security
- **Connection authentication**: Every WebSocket requires valid token
- **Message validation**: All inputs validated with Zod schemas
- **Rate limiting**: Prevents spam/abuse (TODO: implement)
- **Permission checking**: Referees can only control assigned matches

### Data Validation
- **Client-side**: TypeScript + Zod validation
- **Server-side**: Pydantic models + business logic validation
- **State machines**: Enforced match state transitions

## 🎛️ Configuration

### Match Settings
```typescript
const matchConfig = {
  duration: 300, // 5 minutes in seconds
  autoFinish: {
    submissions: true,
    penalties: 3,
    timeExpired: true
  },
  scoring: {
    points: 2,        // Points per scoring action
    maxPenalties: 3,  // Auto-disqualification threshold
    overtimeRules: false // TODO: implement
  }
}
```

### WebSocket Settings
```typescript
const wsConfig = {
  heartbeatInterval: 30000,    // 30 seconds
  reconnectAttempts: 5,        // Max retry attempts
  reconnectDelay: 1000,        // Base delay (exponential backoff)
  maxReconnectDelay: 30000     // Max delay between attempts
}
```

## 🧪 Testing

### Unit Tests
```bash
# Backend
cd apps/api
pytest tests/

# Frontend
cd apps/web
npm run test
```

### Integration Tests
```bash
# WebSocket connections
cd apps/api
pytest tests/test_websocket.py

# E2E referee workflow
cd apps/web
npm run test:e2e
```

### Manual Testing
1. **Open multiple tabs**:
   - Tab 1: `/referee/{match_id}` (as referee)
   - Tab 2: `/hud/{match_id}` (as viewer)
2. **Test scoring actions** in referee panel
3. **Verify real-time updates** in HUD
4. **Test connection recovery** (disconnect/reconnect network)

## 🚨 Troubleshooting

### Common Issues

#### WebSocket Not Connecting
```bash
# Check server is running
curl http://localhost:8000/health

# Check WebSocket endpoint
wscat -c ws://localhost:8000/ws/match/test-match-id

# Verify authentication
# Include token in connection: ?token=<your-jwt>
```

#### Referee Access Denied
1. **Check user role** in database:
   ```sql
   SELECT id, email, role FROM users WHERE email = 'referee@example.com';
   ```
2. **Update role** if needed:
   ```sql
   UPDATE users SET role = 'referee' WHERE id = 'user-id';
   ```

#### Scores Not Updating
1. **Check match state**: Only `IN_PROGRESS` matches accept score updates
2. **Verify participant IDs**: Must match exact IDs in database
3. **Check WebSocket connection**: Look for connection status indicator

#### HUD Not Displaying
1. **Check match exists**: Verify match ID in URL
2. **Inspect browser console**: Look for JavaScript errors
3. **Test API endpoint**: `GET /api/matches/{match_id}`

### Performance Optimization

#### For High-Traffic Tournaments
- **Redis caching**: Store active match states
- **Load balancing**: Multiple FastAPI instances
- **CDN integration**: Serve HUD assets globally
- **Database indexing**: Optimize match queries

#### For OBS/Streaming
- **Browser source settings**:
  - Shutdown source when not visible: ✓
  - Refresh browser when scene becomes active: ✓
  - Hardware acceleration: ✓

## 📈 Monitoring & Analytics

### Metrics to Track
- **WebSocket connections**: Active referee/viewer counts
- **Match events**: Score updates, state changes per minute
- **System performance**: Response times, error rates
- **User engagement**: Session duration, reconnection frequency

### Logging
- **Match events**: All score changes and state transitions
- **User actions**: Authentication, permission checks
- **System events**: Connection/disconnection, errors
- **Performance**: WebSocket message latency

## 🔮 Future Enhancements

### Short Term
- [ ] **Audio notifications**: Sound alerts for scoring
- [ ] **Match replay**: Review scoring history
- [ ] **Mobile app**: Native iOS/Android referee interface
- [ ] **Bracket integration**: Tournament bracket management

### Long Term
- [ ] **AI assistance**: Automatic scoring via computer vision
- [ ] **Multiple sports**: Expand beyond martial arts
- [ ] **Statistics dashboard**: Advanced analytics and reporting
- [ ] **Live commentary**: Integrated commentary tools

## 🤝 Contributing

### Development Workflow
1. **Fork repository**
2. **Create feature branch**: `git checkout -b feature/amazing-feature`
3. **Make changes**: Follow TypeScript/Python best practices
4. **Add tests**: Ensure coverage for new features
5. **Update docs**: Document any API changes
6. **Submit PR**: Include detailed description

### Code Standards
- **TypeScript**: Strict mode, no any types
- **Python**: Type hints, docstrings, PEP 8
- **Testing**: >80% coverage for critical paths
- **Documentation**: All public APIs documented

---

## 📝 License

MIT License - see LICENSE file for details.

## 🆘 Support

- **Issues**: GitHub Issues for bug reports
- **Discussions**: GitHub Discussions for questions
- **Email**: support@tournament-platform.com
- **Discord**: [Tournament Platform Community](https://discord.gg/tournament) 