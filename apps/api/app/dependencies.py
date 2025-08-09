"""FastAPI dependencies for authentication and authorization."""
from typing import Annotated, List, Optional, Union

import httpx
import structlog
from fastapi import Depends, Header, HTTPException, status, WebSocket, Query
from sqlalchemy.ext.asyncio import AsyncSession
from urllib.parse import parse_qs

from app.auth.jwt_auth import (
    extract_token_from_header,
    extract_user_roles_from_payload,
    validate_jwt_token,
    check_user_permissions,
)
from app.core.database import get_db
from app.models.user import CurrentUser, Role

logger = structlog.get_logger()


async def get_current_user(
    authorization: Annotated[Optional[str], Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    """
    Get current authenticated user from JWT token.
    
    This dependency:
    1. Extracts JWT from Authorization header
    2. Validates the token with Supabase
    3. Fetches user data from database
    4. Returns CurrentUser object
    
    Args:
        authorization: Authorization header containing Bearer token
        db: Database session
        
    Returns:
        CurrentUser: Authenticated user object
        
    Raises:
        HTTPException: 401 if authentication fails, 404 if user not found
    """
    # Extract and validate token
    token = await extract_token_from_header(authorization)
    payload = await validate_jwt_token(token)
    
    # Extract roles from token
    roles = extract_user_roles_from_payload(payload)
    
    try:
        # For this implementation, we'll use the Supabase user data
        # In a real app, you'd fetch from your database using payload.sub
        # Here's a simple approach that constructs user from JWT claims
        
        # Get user service and try to fetch user data from database
        from app.services.user_service import get_user_service
        user_service = await get_user_service(db)
        user_data = await user_service.get_user_by_supabase_id(payload.sub)
        
        if user_data:
            # User exists in database, use database data
            current_user = CurrentUser(
                id=user_data["id"],
                email=user_data["email"],
                firstName=user_data["firstName"],
                lastName=user_data["lastName"],
                username=user_data.get("username"),
                avatarUrl=user_data.get("avatarUrl"),
                supabaseId=user_data["supabaseId"],
                roles=user_data.get("roles", roles),  # Use DB roles if available, fallback to JWT roles
                isActive=user_data.get("isActive", True),
            )
        else:
            # User doesn't exist in database, create from JWT
            # Extract name from email or user_metadata
            user_metadata = payload.user_metadata or {}
            email_name = payload.email.split("@")[0]
            
            first_name = (
                user_metadata.get("first_name") or
                user_metadata.get("firstName") or
                user_metadata.get("name", "").split()[0] if user_metadata.get("name") else email_name
            )
            last_name = (
                user_metadata.get("last_name") or
                user_metadata.get("lastName") or
                " ".join(user_metadata.get("name", "").split()[1:]) if user_metadata.get("name") else ""
            )
            
            current_user = CurrentUser(
                id=payload.sub,  # Use Supabase ID as primary ID for now
                email=payload.email,
                firstName=first_name,
                lastName=last_name,
                username=user_metadata.get("username"),
                avatarUrl=user_metadata.get("avatar_url"),
                supabaseId=payload.sub,
                roles=roles,
                isActive=True,
            )
        
        logger.debug(
            "User authenticated successfully",
            user_id=current_user.id,
            email=current_user.email,
            roles=[role.value for role in current_user.roles],
        )
        
        return current_user
        
    except Exception as e:
        logger.error("Failed to create user from token", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to authenticate user"
        )


async def get_current_user_websocket(websocket: WebSocket) -> CurrentUser:
    """Authenticate websocket connections using JWT from query param `token` or Authorization header."""
    # Try query param first
    token: Optional[str] = None
    query = parse_qs(websocket.url.query or "") if websocket.url and websocket.url.query else {}
    qp_tokens = query.get("token") if isinstance(query, dict) else None
    if qp_tokens and len(qp_tokens) > 0:
        token = qp_tokens[0]
    
    # Fallback to Authorization header
    if not token:
        auth_header = websocket.headers.get("authorization") or websocket.headers.get("Authorization")
        if auth_header:
            try:
                _, tok = auth_header.split()
                token = tok
            except Exception:
                pass
    
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing websocket token")
    
    payload = await validate_jwt_token(token)
    roles = extract_user_roles_from_payload(payload)
    
    # Construct minimal CurrentUser from token
    current_user = CurrentUser(
        id=payload.sub,
        email=payload.email,
        firstName=payload.user_metadata.get("first_name") if payload.user_metadata else payload.email.split("@")[0],
        lastName=payload.user_metadata.get("last_name") if payload.user_metadata else "",
        username=(payload.user_metadata or {}).get("username"),
        avatarUrl=(payload.user_metadata or {}).get("avatar_url"),
        supabaseId=payload.sub,
        roles=roles,
        isActive=True,
    )
    return current_user


async def fetch_user_from_db(db: AsyncSession, supabase_id: str) -> Optional[dict]:
    """
    Fetch user data from database by Supabase ID.
    
    This is a placeholder implementation. In a real app, you'd use your ORM
    to fetch user data and roles from the database.
    
    Args:
        db: Database session
        supabase_id: Supabase user ID
        
    Returns:
        Optional[dict]: User data if found, None otherwise
    """
    try:
        # Placeholder: In real implementation, query your database
        # Example SQL query:
        # result = await db.execute(
        #     select(User, UserRole.role)
        #     .outerjoin(UserRole)
        #     .where(User.supabaseId == supabase_id)
        # )
        # user_data = result.first()
        
        # For now, return None to indicate user should be created from JWT
        return None
        
    except Exception as e:
        logger.error("Database query failed", error=str(e))
        return None


def get_current_user_with_role(
    required_roles: Union[Role, List[Role]],
    allow_inactive: bool = False,
) -> callable:
    """
    Create a dependency that requires specific role(s).
    
    Usage:
        @app.get("/admin-only")
        async def admin_endpoint(
            user: CurrentUser = Depends(get_current_user_with_role(Role.ADMIN))
        ):
            return {"message": "Admin access granted"}
        
        @app.get("/organizer-or-admin")
        async def organizer_endpoint(
            user: CurrentUser = Depends(get_current_user_with_role([Role.ADMIN, Role.ORGANIZER]))
        ):
            return {"message": "Organizer or admin access granted"}
    
    Args:
        required_roles: Single role or list of roles that are allowed
        allow_inactive: Whether to allow inactive users
        
    Returns:
        callable: FastAPI dependency function
    """
    # Normalize to list
    if isinstance(required_roles, Role):
        roles_list = [required_roles]
    else:
        roles_list = required_roles
    
    async def dependency(
        current_user: CurrentUser = Depends(get_current_user)
    ) -> CurrentUser:
        """Dependency that checks user roles."""
        check_user_permissions(
            current_user,
            required_roles=roles_list,
            allow_inactive=allow_inactive,
        )
        return current_user
    
    return dependency


# Convenience dependencies for common role checks
get_admin_user = get_current_user_with_role(Role.ADMIN)
get_organizer_user = get_current_user_with_role([Role.ADMIN, Role.ORGANIZER])
get_referee_user = get_current_user_with_role([Role.ADMIN, Role.REFEREE])
get_competitor_user = get_current_user_with_role([Role.ADMIN, Role.ORGANIZER, Role.COMPETITOR])
get_coach_user = get_current_user_with_role([Role.ADMIN, Role.ORGANIZER, Role.COACH])


def get_current_active_user(
    current_user: CurrentUser = Depends(get_current_user)
) -> CurrentUser:
    """
    Get current user and ensure they are active.
    
    Args:
        current_user: Current authenticated user
        
    Returns:
        CurrentUser: Active user
        
    Raises:
        HTTPException: 403 if user is inactive
    """
    if not current_user.isActive:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive"
        )
    return current_user


def get_current_user_optional(
    authorization: Annotated[Optional[str], Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> Optional[CurrentUser]:
    """
    Get current user if token is provided, otherwise return None.
    
    This is useful for endpoints that have optional authentication.
    
    Args:
        authorization: Authorization header containing Bearer token
        db: Database session
        
    Returns:
        Optional[CurrentUser]: User if authenticated, None otherwise
    """
    if not authorization:
        return None
    
    try:
        # Use a direct approach to avoid raising exceptions
        from asyncio import create_task
        import asyncio
        
        async def get_user():
            return await get_current_user(authorization, db)
        
        # This is a simplified version - in practice you'd handle this differently
        return asyncio.run(get_user())
    except HTTPException:
        return None
    except Exception:
        logger.warning("Failed to authenticate optional user")
        return None


# Additional role-based dependencies for specific use cases
def require_tournament_management_role():
    """Require role that can manage tournaments."""
    return get_current_user_with_role([Role.ADMIN, Role.ORGANIZER])


def require_match_management_role():
    """Require role that can manage matches."""
    return get_current_user_with_role([Role.ADMIN, Role.ORGANIZER, Role.REFEREE])


def require_user_management_role():
    """Require role that can manage users."""
    return get_current_user_with_role(Role.ADMIN) 