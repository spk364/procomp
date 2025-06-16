"""Main API router with example authenticated endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List

from app.dependencies import (
    get_current_user,
    get_current_active_user,
    get_admin_user,
    get_organizer_user,
    get_referee_user,
    get_current_user_with_role,
    require_tournament_management_role,
    require_match_management_role,
    require_user_management_role,
)
from app.models.user import CurrentUser, Role, UserResponse

# Create main API router
api_router = APIRouter()


# ===== AUTHENTICATION EXAMPLES =====

@api_router.get("/auth/me")
async def get_current_user_info(
    current_user: CurrentUser = Depends(get_current_user)
):
    """Get current user information."""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "username": current_user.username,
        "firstName": current_user.firstName,
        "lastName": current_user.lastName,
        "avatarUrl": current_user.avatarUrl,
        "isActive": current_user.isActive,
        "supabaseId": current_user.supabaseId,
        "roles": [role.value for role in current_user.roles],
    }


@api_router.get("/auth/profile")
async def get_user_profile(
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """Get user profile (requires active user)."""
    return {
        "user": {
            "id": current_user.id,
            "email": current_user.email,
            "full_name": current_user.full_name,
            "roles": [role.value for role in current_user.roles],
            "permissions": {
                "can_organize_tournaments": current_user.can_organize_tournaments(),
                "can_referee_matches": current_user.can_referee_matches(),
                "is_admin": current_user.is_admin(),
            }
        }
    }


# ===== ROLE-BASED ACCESS EXAMPLES =====

@api_router.get("/admin/dashboard")
async def admin_dashboard(
    current_user: CurrentUser = Depends(get_admin_user)
):
    """Admin-only dashboard."""
    return {
        "message": "Welcome to admin dashboard",
        "user": current_user.full_name,
        "admin_features": [
            "User management",
            "Tournament oversight",
            "System configuration",
            "Analytics"
        ]
    }


@api_router.get("/organizer/tournaments")
async def get_organizer_tournaments(
    current_user: CurrentUser = Depends(get_organizer_user)
):
    """Get tournaments for organizers (Admin or Organizer role)."""
    return {
        "message": f"Tournaments for {current_user.full_name}",
        "can_create": True,
        "can_manage": True,
        "tournaments": []  # Would fetch from database
    }


@api_router.get("/referee/matches")
async def get_referee_matches(
    current_user: CurrentUser = Depends(get_referee_user)
):
    """Get matches for referees (Admin or Referee role)."""
    return {
        "message": f"Matches assigned to {current_user.full_name}",
        "can_score": True,
        "can_manage": True,
        "matches": []  # Would fetch from database
    }


@api_router.get("/competitor/registrations")
async def get_competitor_registrations(
    current_user: CurrentUser = Depends(get_current_user_with_role([Role.ADMIN, Role.COMPETITOR]))
):
    """Get registrations for competitors."""
    return {
        "message": f"Registrations for {current_user.full_name}",
        "can_register": True,
        "registrations": []  # Would fetch from database
    }


# ===== TOURNAMENT MANAGEMENT EXAMPLES =====

@api_router.post("/tournaments")
async def create_tournament(
    tournament_data: dict,  # Would use proper Pydantic model
    current_user: CurrentUser = Depends(require_tournament_management_role())
):
    """Create a new tournament (Organizer or Admin only)."""
    return {
        "message": "Tournament created successfully",
        "created_by": current_user.full_name,
        "tournament": tournament_data
    }


@api_router.put("/tournaments/{tournament_id}")
async def update_tournament(
    tournament_id: str,
    tournament_data: dict,
    current_user: CurrentUser = Depends(require_tournament_management_role())
):
    """Update tournament (Organizer or Admin only)."""
    return {
        "message": f"Tournament {tournament_id} updated",
        "updated_by": current_user.full_name
    }


@api_router.delete("/tournaments/{tournament_id}")
async def delete_tournament(
    tournament_id: str,
    current_user: CurrentUser = Depends(get_admin_user)  # Only admins can delete
):
    """Delete tournament (Admin only)."""
    return {
        "message": f"Tournament {tournament_id} deleted",
        "deleted_by": current_user.full_name
    }


# ===== MATCH MANAGEMENT EXAMPLES =====

@api_router.post("/matches/{match_id}/score")
async def score_match(
    match_id: str,
    score_data: dict,
    current_user: CurrentUser = Depends(require_match_management_role())
):
    """Score a match (Admin, Organizer, or Referee)."""
    return {
        "message": f"Match {match_id} scored",
        "scored_by": current_user.full_name,
        "can_referee": current_user.can_referee_matches()
    }


# ===== USER MANAGEMENT EXAMPLES =====

@api_router.get("/admin/users")
async def list_users(
    current_user: CurrentUser = Depends(require_user_management_role())
):
    """List all users (Admin only)."""
    return {
        "message": "User list",
        "total_users": 0,  # Would query database
        "users": []
    }


@api_router.put("/admin/users/{user_id}/roles")
async def update_user_roles(
    user_id: str,
    roles: List[Role],
    current_user: CurrentUser = Depends(require_user_management_role())
):
    """Update user roles (Admin only)."""
    return {
        "message": f"Roles updated for user {user_id}",
        "new_roles": [role.value for role in roles],
        "updated_by": current_user.full_name
    }


# ===== MULTIPLE ROLE EXAMPLES =====

@api_router.get("/tournaments/{tournament_id}/manage")
async def manage_tournament(
    tournament_id: str,
    current_user: CurrentUser = Depends(
        get_current_user_with_role([Role.ADMIN, Role.ORGANIZER])
    )
):
    """Manage specific tournament (Admin or Organizer)."""
    return {
        "tournament_id": tournament_id,
        "manager": current_user.full_name,
        "permissions": {
            "can_edit": True,
            "can_delete": current_user.is_admin(),
            "can_manage_participants": True,
            "can_generate_brackets": True,
        }
    }


@api_router.get("/health/authenticated")
async def authenticated_health_check(
    current_user: CurrentUser = Depends(get_current_user)
):
    """Health check that requires authentication."""
    return {
        "status": "healthy",
        "authenticated": True,
        "user": current_user.email,
        "roles": [role.value for role in current_user.roles]
    } 