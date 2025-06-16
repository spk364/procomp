# Authentication & Role-Based Access Control Implementation

This document describes the complete authentication and role-based access control system for the ProComp martial arts tournament platform.

## 🎯 Features

- **JWT Authentication**: Validates Supabase-issued JWTs
- **Role-Based Access Control**: Supports `ADMIN`, `ORGANIZER`, `COMPETITOR`, `REFEREE`, `COACH` roles
- **FastAPI Dependencies**: Clean dependency injection pattern
- **Database Integration**: Async database operations with SQLAlchemy
- **Flexible Architecture**: Easy to extend and customize

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Supabase       │    │   FastAPI       │
│   (Next.js)     │◄──►│   Auth           │◄──►│   Backend       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                               │                         │
                               ▼                         ▼
                      ┌──────────────────┐    ┌─────────────────┐
                      │   JWT Tokens     │    │   Database      │
                      │   (HS256)        │    │   (PostgreSQL)  │
                      └──────────────────┘    └─────────────────┘
```

## 🔧 Setup & Configuration

### 1. Environment Variables

Create a `.env` file with the following variables:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/procomp"

# Supabase
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_JWT_SECRET="your-jwt-secret"
SUPABASE_SERVICE_KEY="your-service-key"

# App Settings
ENVIRONMENT="development"
LOG_LEVEL="INFO"
```

### 2. Install Dependencies

The system requires these Python packages (already in `pyproject.toml`):

```toml
dependencies = [
    "fastapi[all]>=0.104.1",
    "python-jose[cryptography]>=3.3.0",
    "sqlalchemy>=2.0.23",
    "asyncpg>=0.29.0",
    "pydantic>=2.5.0",
    "structlog>=23.2.0",
    # ... other dependencies
]
```

## 📚 Core Components

### 1. JWT Authentication (`app/auth/jwt_auth.py`)

The JWT authentication module validates Supabase tokens and extracts user information:

```python
from app.auth.jwt_auth import validate_jwt_token, extract_user_roles_from_payload

# Validate token
payload = await validate_jwt_token(token)

# Extract roles from various JWT claims
roles = extract_user_roles_from_payload(payload)
```

**Key Features:**
- Token validation with Supabase JWT secret
- Automatic token expiration handling
- Role extraction from multiple JWT claim sources
- Comprehensive error handling

### 2. User Models (`app/models/user.py`)

Comprehensive user models with role-based methods:

```python
from app.models.user import CurrentUser, Role

# Check user permissions
if current_user.is_admin():
    # Admin-only logic
    pass

if current_user.can_organize_tournaments():
    # Tournament organization logic
    pass

if current_user.has_role(Role.REFEREE):
    # Referee-specific logic
    pass
```

### 3. FastAPI Dependencies (`app/dependencies.py`)

Clean dependency injection for authentication and authorization:

```python
from app.dependencies import (
    get_current_user,
    get_admin_user,
    get_organizer_user,
    get_current_user_with_role
)

@app.get("/admin-only")
async def admin_endpoint(user: CurrentUser = Depends(get_admin_user)):
    return {"message": "Admin access granted"}

@app.get("/multi-role")
async def multi_role_endpoint(
    user: CurrentUser = Depends(get_current_user_with_role([Role.ADMIN, Role.ORGANIZER]))
):
    return {"message": "Admin or Organizer access"}
```

## 🔒 Usage Examples

### Basic Authentication

```python
from fastapi import Depends
from app.dependencies import get_current_user
from app.models.user import CurrentUser

@app.get("/profile")
async def get_profile(current_user: CurrentUser = Depends(get_current_user)):
    return {
        "user": current_user.email,
        "roles": [role.value for role in current_user.roles]
    }
```

### Role-Based Access Control

```python
# Admin only
@app.get("/admin/dashboard")
async def admin_dashboard(user: CurrentUser = Depends(get_admin_user)):
    return {"admin_features": ["user_management", "system_config"]}

# Multiple roles allowed
@app.post("/tournaments")
async def create_tournament(
    tournament_data: dict,
    user: CurrentUser = Depends(get_current_user_with_role([Role.ADMIN, Role.ORGANIZER]))
):
    return {"message": "Tournament created", "created_by": user.full_name}

# Custom role validation
@app.get("/referee/matches")
async def get_referee_matches(user: CurrentUser = Depends(get_current_user)):
    if not user.can_referee_matches():
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return {"matches": []}
```

### Tournament Management Example

```python
@app.post("/tournaments")
async def create_tournament(
    tournament_data: TournamentCreate,
    current_user: CurrentUser = Depends(require_tournament_management_role())
):
    """Create tournament - Admin or Organizer only."""
    return await tournament_service.create(tournament_data, current_user.id)

@app.delete("/tournaments/{tournament_id}")
async def delete_tournament(
    tournament_id: str,
    current_user: CurrentUser = Depends(get_admin_user)  # Admin only
):
    """Delete tournament - Admin only."""
    return await tournament_service.delete(tournament_id)
```

## 🗄️ Database Integration

### User Service (`app/services/user_service.py`)

The user service handles all database operations:

```python
from app.services.user_service import get_user_service

async def some_endpoint(db: AsyncSession = Depends(get_db)):
    user_service = await get_user_service(db)
    
    # Get user by Supabase ID
    user = await user_service.get_user_by_supabase_id(supabase_id)
    
    # Create new user
    new_user = await user_service.create_user(user_data)
    
    # Update user roles
    success = await user_service.update_user_roles(user_id, [Role.ADMIN])
```

### Database Schema

The system works with the existing Prisma schema:

```prisma
model User {
  id          String   @id @default(cuid())
  email       String   @unique
  firstName   String
  lastName    String
  supabaseId  String?  @unique
  isActive    Boolean  @default(true)
  roles       UserRole[]
  // ... other fields
}

model UserRole {
  id     String @id @default(cuid())
  userId String
  user   User   @relation(fields: [userId], references: [id])
  role   Role
}

enum Role {
  ADMIN
  ORGANIZER
  COMPETITOR
  REFEREE
  COACH
}
```

## 🔐 Security Features

### JWT Token Validation

- **Algorithm**: HS256 with Supabase JWT secret
- **Claims Validation**: Audience, issuer, expiration
- **Error Handling**: Comprehensive error types for different failure modes

### Role Extraction

The system looks for roles in multiple JWT locations:

1. `user_roles` claim (array)
2. `user_role` claim (single role)
3. `app_metadata.roles` (Supabase custom claims)
4. `app_metadata.role` (single role)
5. `user_metadata.role` (user-defined role)

### Permission Checking

```python
# Built-in permission methods
user.is_admin()                    # Check if user is admin
user.can_organize_tournaments()    # Check tournament organization rights
user.can_referee_matches()         # Check referee permissions
user.has_role(Role.ORGANIZER)      # Check specific role
user.has_any_role([Role.ADMIN, Role.ORGANIZER])  # Check multiple roles
```

## 🚀 Frontend Integration

### Axios Configuration

```typescript
// Frontend API client setup
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const apiClient = axios.create({
  baseURL: 'http://localhost:8000/api/v1',
});

// Add auth interceptor
apiClient.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  
  return config;
});
```

### React Hook Example

```typescript
// useAuth hook
import { useSupabaseClient, useUser } from '@supabase/auth-helpers-react';

export function useAuth() {
  const supabase = useSupabaseClient();
  const user = useUser();
  
  const callAPI = async (endpoint: string, options?: RequestInit) => {
    const { data: { session } } = await supabase.auth.getSession();
    
    return fetch(`/api/v1${endpoint}`, {
      ...options,
      headers: {
        ...options?.headers,
        Authorization: `Bearer ${session?.access_token}`,
      },
    });
  };
  
  return { user, callAPI };
}
```

## 🛠️ Customization

### Adding Custom Roles

1. Update the Prisma schema:
```prisma
enum Role {
  ADMIN
  ORGANIZER
  COMPETITOR
  REFEREE
  COACH
  JUDGE        // New role
  VOLUNTEER    // New role
}
```

2. Update the Role enum in `app/models/user.py`:
```python
class Role(str, Enum):
    ADMIN = "ADMIN"
    ORGANIZER = "ORGANIZER" 
    COMPETITOR = "COMPETITOR"
    REFEREE = "REFEREE"
    COACH = "COACH"
    JUDGE = "JUDGE"
    VOLUNTEER = "VOLUNTEER"
```

3. Create new dependencies:
```python
get_judge_user = get_current_user_with_role([Role.ADMIN, Role.JUDGE])
```

### Custom Permission Methods

Add methods to the `CurrentUser` model:

```python
class CurrentUser(BaseModel):
    # ... existing fields ...
    
    def can_judge_matches(self) -> bool:
        """Check if user can judge matches."""
        return self.has_any_role([Role.ADMIN, Role.JUDGE, Role.REFEREE])
    
    def can_manage_volunteers(self) -> bool:
        """Check if user can manage volunteers.""" 
        return self.has_any_role([Role.ADMIN, Role.ORGANIZER])
```

## 🔍 Testing

### Unit Tests Example

```python
import pytest
from app.auth.jwt_auth import extract_user_roles_from_payload, JWTPayload

def test_role_extraction():
    payload = JWTPayload(
        sub="user123",
        email="test@example.com",
        iat=1234567890,
        exp=1234567890 + 3600,
        iss="https://your-project.supabase.co",
        app_metadata={"roles": ["ADMIN", "ORGANIZER"]}
    )
    
    roles = extract_user_roles_from_payload(payload)
    assert Role.ADMIN in roles
    assert Role.ORGANIZER in roles
```

### Integration Tests

```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_protected_endpoint():
    # Test without token
    response = client.get("/api/v1/admin/dashboard")
    assert response.status_code == 401
    
    # Test with admin token
    headers = {"Authorization": f"Bearer {admin_token}"}
    response = client.get("/api/v1/admin/dashboard", headers=headers)
    assert response.status_code == 200
```

## 📋 Deployment Checklist

- [ ] Set up environment variables
- [ ] Configure Supabase project
- [ ] Run database migrations
- [ ] Test JWT token validation
- [ ] Verify role-based access
- [ ] Set up monitoring and logging
- [ ] Configure CORS settings
- [ ] Test frontend integration

## 🐛 Troubleshooting

### Common Issues

1. **JWT Validation Fails**
   - Check `SUPABASE_JWT_SECRET` is correct
   - Verify token hasn't expired
   - Ensure correct algorithm (HS256)

2. **Roles Not Found**
   - Check Supabase custom claims configuration
   - Verify role data in JWT payload
   - Ensure database has user roles

3. **Permission Denied**
   - Verify user has required roles
   - Check if user account is active
   - Validate dependency usage

### Debug Logging

Enable debug logging to troubleshoot:

```python
import structlog

logger = structlog.get_logger()
logger.debug("Token payload", payload=payload.dict())
logger.debug("Extracted roles", roles=[r.value for r in roles])
```

## 📈 Performance Considerations

- **JWT Validation**: Cached JWKS for better performance
- **Database Queries**: Optimized user/role lookups
- **Connection Pooling**: Configured for async operations
- **Error Handling**: Fast-fail for invalid tokens

This authentication system provides a robust, scalable foundation for the ProComp tournament platform with clear separation of concerns and excellent developer experience. 