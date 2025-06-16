"""JWT authentication with Supabase integration."""
import json
from datetime import datetime, timezone
from typing import Optional

import httpx
import structlog
from fastapi import HTTPException, status
from jose import JWTError, jwt
from pydantic import BaseModel, ValidationError

from app.core.config import get_settings
from app.models.user import CurrentUser, Role

logger = structlog.get_logger()
settings = get_settings()


class JWTPayload(BaseModel):
    """Supabase JWT payload structure."""
    sub: str  # Supabase user ID
    email: str
    aud: str = "authenticated"
    role: str = "authenticated"  # Supabase role (authenticated/anon)
    iat: int
    exp: int
    iss: str
    app_metadata: dict = {}
    user_metadata: dict = {}
    
    # Custom claims for our app
    user_role: Optional[str] = None  # Our app's role claim
    user_roles: Optional[list[str]] = None  # Multiple roles support


class SupabaseJWKS(BaseModel):
    """Supabase JWKS response structure."""
    keys: list[dict]


class JWTAuthError(Exception):
    """JWT authentication error."""
    pass


class TokenExpiredError(JWTAuthError):
    """Token has expired."""
    pass


class InvalidTokenError(JWTAuthError):
    """Token is invalid."""
    pass


class InsufficientPermissionsError(JWTAuthError):
    """User lacks required permissions."""
    pass


class SupabaseJWTValidator:
    """Validates Supabase-issued JWTs."""
    
    def __init__(self):
        self.jwks_cache: Optional[dict] = None
        self.jwks_last_fetch: Optional[datetime] = None
        self.jwks_cache_ttl = 3600  # 1 hour
    
    async def _fetch_jwks(self) -> dict:
        """Fetch JWKS from Supabase."""
        try:
            # Use the JWT secret directly for HS256 algorithm
            # Supabase typically uses HS256 with a shared secret
            return {"secret": settings.SUPABASE_JWT_SECRET}
        except Exception as e:
            logger.error("Failed to fetch JWKS", error=str(e))
            raise InvalidTokenError("Failed to validate token")
    
    def _is_jwks_cache_valid(self) -> bool:
        """Check if JWKS cache is still valid."""
        if not self.jwks_cache or not self.jwks_last_fetch:
            return False
        
        now = datetime.now(timezone.utc)
        return (now - self.jwks_last_fetch).total_seconds() < self.jwks_cache_ttl
    
    async def _get_signing_key(self) -> str:
        """Get the signing key for token validation."""
        if not self._is_jwks_cache_valid():
            self.jwks_cache = await self._fetch_jwks()
            self.jwks_last_fetch = datetime.now(timezone.utc)
        
        return self.jwks_cache["secret"]
    
    async def validate_token(self, token: str) -> JWTPayload:
        """
        Validate a Supabase JWT token.
        
        Args:
            token: The JWT token to validate
            
        Returns:
            JWTPayload: Decoded and validated token payload
            
        Raises:
            TokenExpiredError: If token has expired
            InvalidTokenError: If token is invalid
        """
        try:
            # Get signing key
            signing_key = await self._get_signing_key()
            
            # Decode token without verification first to check expiry
            unverified_payload = jwt.get_unverified_claims(token)
            
            # Check expiration
            now = datetime.now(timezone.utc).timestamp()
            if unverified_payload.get("exp", 0) < now:
                raise TokenExpiredError("Token has expired")
            
            # Decode and verify token
            payload = jwt.decode(
                token,
                signing_key,
                algorithms=[settings.JWT_ALGORITHM],
                audience="authenticated",  # Supabase default audience
                issuer=settings.SUPABASE_URL,
            )
            
            # Validate payload structure
            jwt_payload = JWTPayload(**payload)
            
            logger.debug(
                "Token validated successfully",
                user_id=jwt_payload.sub,
                email=jwt_payload.email,
            )
            
            return jwt_payload
            
        except jwt.ExpiredSignatureError:
            logger.warning("Token expired", token_preview=token[:20])
            raise TokenExpiredError("Token has expired")
        except jwt.InvalidTokenError as e:
            logger.warning("Invalid token", error=str(e), token_preview=token[:20])
            raise InvalidTokenError(f"Invalid token: {str(e)}")
        except ValidationError as e:
            logger.error("Token payload validation failed", error=str(e))
            raise InvalidTokenError("Token payload is malformed")
        except Exception as e:
            logger.error("Unexpected error validating token", error=str(e))
            raise InvalidTokenError("Token validation failed")


# Global validator instance
jwt_validator = SupabaseJWTValidator()


async def extract_token_from_header(authorization: Optional[str]) -> str:
    """
    Extract JWT token from Authorization header.
    
    Args:
        authorization: Authorization header value
        
    Returns:
        str: The JWT token
        
    Raises:
        HTTPException: If authorization header is missing or invalid
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise ValueError("Invalid scheme")
        return token
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format. Expected 'Bearer <token>'",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def validate_jwt_token(token: str) -> JWTPayload:
    """
    Validate JWT token and return payload.
    
    Args:
        token: The JWT token to validate
        
    Returns:
        JWTPayload: Validated token payload
        
    Raises:
        HTTPException: If token is invalid or expired
    """
    try:
        return await jwt_validator.validate_token(token)
    except TokenExpiredError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )


def extract_user_roles_from_payload(payload: JWTPayload) -> list[Role]:
    """
    Extract user roles from JWT payload.
    
    This function looks for role information in multiple places:
    1. user_roles claim (array of roles)
    2. user_role claim (single role)
    3. app_metadata.roles (Supabase custom claims)
    4. user_metadata.role (user-defined role)
    
    Args:
        payload: JWT payload
        
    Returns:
        list[Role]: List of user roles
    """
    roles = []
    
    # Try to get roles from custom claims
    if payload.user_roles:
        roles.extend(payload.user_roles)
    elif payload.user_role:
        roles.append(payload.user_role)
    
    # Check app_metadata for roles (Supabase custom claims)
    app_metadata = payload.app_metadata or {}
    if "roles" in app_metadata:
        if isinstance(app_metadata["roles"], list):
            roles.extend(app_metadata["roles"])
        else:
            roles.append(app_metadata["roles"])
    elif "role" in app_metadata:
        roles.append(app_metadata["role"])
    
    # Check user_metadata for role
    user_metadata = payload.user_metadata or {}
    if "role" in user_metadata:
        roles.append(user_metadata["role"])
    
    # Default to COMPETITOR if no roles found
    if not roles:
        roles = ["COMPETITOR"]
    
    # Convert to Role enum, filtering out invalid roles
    valid_roles = []
    for role_str in roles:
        try:
            role = Role(role_str.upper())
            if role not in valid_roles:
                valid_roles.append(role)
        except ValueError:
            logger.warning("Invalid role in token", role=role_str)
    
    # Ensure at least one valid role
    if not valid_roles:
        valid_roles = [Role.COMPETITOR]
    
    return valid_roles


def check_user_roles(user_roles: list[Role], required_roles: list[Role]) -> bool:
    """
    Check if user has any of the required roles.
    
    Args:
        user_roles: User's current roles
        required_roles: Required roles for access
        
    Returns:
        bool: True if user has at least one required role
    """
    return any(role in user_roles for role in required_roles)


def check_user_permissions(
    user: CurrentUser,
    required_roles: Optional[list[Role]] = None,
    allow_inactive: bool = False,
) -> None:
    """
    Check user permissions against requirements.
    
    Args:
        user: Current user
        required_roles: Required roles for access
        allow_inactive: Whether to allow inactive users
        
    Raises:
        HTTPException: If user lacks required permissions
    """
    # Check if user is active
    if not allow_inactive and not user.isActive:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive"
        )
    
    # Check roles if specified
    if required_roles:
        if not check_user_roles(user.roles, required_roles):
            required_role_names = [role.value for role in required_roles]
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required roles: {required_role_names}"
            ) 