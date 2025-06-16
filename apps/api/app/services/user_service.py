"""User service for database operations."""
from typing import List, Optional

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import CurrentUser, Role, UserCreate, UserUpdate

logger = structlog.get_logger()


class UserService:
    """Service for user-related database operations."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def get_user_by_supabase_id(self, supabase_id: str) -> Optional[dict]:
        """
        Get user by Supabase ID with roles.
        
        This implementation uses raw SQL since you're using Prisma.
        In a real implementation, you'd use Prisma client.
        
        Args:
            supabase_id: Supabase user ID
            
        Returns:
            Optional[dict]: User data with roles if found
        """
        try:
            # Raw SQL query to get user with roles
            # In practice, you'd use Prisma client for this
            query = text("""
                SELECT 
                    u.id,
                    u.email,
                    u.username,
                    u."firstName",
                    u."lastName",
                    u."avatarUrl",
                    u.phone,
                    u."isActive",
                    u."supabaseId",
                    u."clubId",
                    u."createdAt",
                    u."updatedAt",
                    ARRAY_AGG(ur.role) as roles
                FROM users u
                LEFT JOIN user_roles ur ON u.id = ur."userId"
                WHERE u."supabaseId" = :supabase_id
                GROUP BY u.id
            """)
            
            result = await self.db.execute(query, {"supabase_id": supabase_id})
            row = result.fetchone()
            
            if not row:
                return None
            
            # Convert roles array to Role enums
            roles = []
            if row.roles and row.roles[0]:  # Check if roles exist and first isn't None
                for role_str in row.roles:
                    try:
                        roles.append(Role(role_str))
                    except ValueError:
                        logger.warning("Invalid role in database", role=role_str)
            
            # Default to COMPETITOR if no roles
            if not roles:
                roles = [Role.COMPETITOR]
            
            return {
                "id": row.id,
                "email": row.email,
                "username": row.username,
                "firstName": row.firstName,
                "lastName": row.lastName,
                "avatarUrl": row.avatarUrl,
                "phone": row.phone,
                "isActive": row.isActive,
                "supabaseId": row.supabaseId,
                "clubId": row.clubId,
                "roles": roles,
                "createdAt": row.createdAt,
                "updatedAt": row.updatedAt,
            }
            
        except Exception as e:
            logger.error("Failed to fetch user by Supabase ID", error=str(e), supabase_id=supabase_id)
            return None
    
    async def create_user(self, user_data: UserCreate) -> Optional[dict]:
        """
        Create a new user in the database.
        
        Args:
            user_data: User creation data
            
        Returns:
            Optional[dict]: Created user data
        """
        try:
            # Generate a new user ID (in practice, use cuid() or UUID)
            import uuid
            user_id = str(uuid.uuid4())
            
            # Insert user
            user_query = text("""
                INSERT INTO users (
                    id, email, username, "firstName", "lastName", 
                    "avatarUrl", phone, "supabaseId", "clubId", "isActive"
                ) VALUES (
                    :id, :email, :username, :firstName, :lastName,
                    :avatarUrl, :phone, :supabaseId, :clubId, :isActive
                ) RETURNING *
            """)
            
            user_result = await self.db.execute(user_query, {
                "id": user_id,
                "email": user_data.email,
                "username": user_data.username,
                "firstName": user_data.firstName,
                "lastName": user_data.lastName,
                "avatarUrl": user_data.avatarUrl,
                "phone": user_data.phone,
                "supabaseId": user_data.supabaseId,
                "clubId": user_data.clubId,
                "isActive": True,
            })
            
            user_row = user_result.fetchone()
            
            # Insert user roles
            for role in user_data.roles:
                role_id = str(uuid.uuid4())
                role_query = text("""
                    INSERT INTO user_roles (id, "userId", role)
                    VALUES (:id, :userId, :role)
                """)
                await self.db.execute(role_query, {
                    "id": role_id,
                    "userId": user_id,
                    "role": role.value,
                })
            
            await self.db.commit()
            
            return {
                "id": user_row.id,
                "email": user_row.email,
                "username": user_row.username,
                "firstName": user_row.firstName,
                "lastName": user_row.lastName,
                "avatarUrl": user_row.avatarUrl,
                "phone": user_row.phone,
                "isActive": user_row.isActive,
                "supabaseId": user_row.supabaseId,
                "clubId": user_row.clubId,
                "roles": user_data.roles,
                "createdAt": user_row.createdAt,
                "updatedAt": user_row.updatedAt,
            }
            
        except Exception as e:
            await self.db.rollback()
            logger.error("Failed to create user", error=str(e), user_data=user_data.dict())
            return None
    
    async def update_user(self, user_id: str, user_data: UserUpdate) -> Optional[dict]:
        """
        Update user data.
        
        Args:
            user_id: User ID to update
            user_data: Updated user data
            
        Returns:
            Optional[dict]: Updated user data
        """
        try:
            # Build dynamic update query
            update_fields = []
            params = {"id": user_id}
            
            for field, value in user_data.dict(exclude_unset=True).items():
                if field == "isActive":
                    update_fields.append(f'"{field}" = :isActive')
                    params["isActive"] = value
                elif field in ["firstName", "lastName", "avatarUrl", "clubId"]:
                    update_fields.append(f'"{field}" = :{field}')
                    params[field] = value
                else:
                    update_fields.append(f'{field} = :{field}')
                    params[field] = value
            
            if not update_fields:
                return None
            
            query = text(f"""
                UPDATE users 
                SET {', '.join(update_fields)}, "updatedAt" = NOW()
                WHERE id = :id
                RETURNING *
            """)
            
            result = await self.db.execute(query, params)
            row = result.fetchone()
            
            if not row:
                return None
            
            await self.db.commit()
            
            # Get updated user with roles
            return await self.get_user_by_supabase_id(row.supabaseId)
            
        except Exception as e:
            await self.db.rollback()
            logger.error("Failed to update user", error=str(e), user_id=user_id)
            return None
    
    async def update_user_roles(self, user_id: str, roles: List[Role]) -> bool:
        """
        Update user roles.
        
        Args:
            user_id: User ID
            roles: New roles list
            
        Returns:
            bool: True if successful
        """
        try:
            # Delete existing roles
            delete_query = text("""
                DELETE FROM user_roles WHERE "userId" = :userId
            """)
            await self.db.execute(delete_query, {"userId": user_id})
            
            # Insert new roles
            import uuid
            for role in roles:
                role_id = str(uuid.uuid4())
                insert_query = text("""
                    INSERT INTO user_roles (id, "userId", role)
                    VALUES (:id, :userId, :role)
                """)
                await self.db.execute(insert_query, {
                    "id": role_id,
                    "userId": user_id,
                    "role": role.value,
                })
            
            await self.db.commit()
            return True
            
        except Exception as e:
            await self.db.rollback()
            logger.error("Failed to update user roles", error=str(e), user_id=user_id)
            return False
    
    async def deactivate_user(self, user_id: str) -> bool:
        """
        Deactivate a user.
        
        Args:
            user_id: User ID to deactivate
            
        Returns:
            bool: True if successful
        """
        try:
            query = text("""
                UPDATE users 
                SET "isActive" = false, "updatedAt" = NOW()
                WHERE id = :id
            """)
            
            result = await self.db.execute(query, {"id": user_id})
            await self.db.commit()
            
            return result.rowcount > 0
            
        except Exception as e:
            await self.db.rollback()
            logger.error("Failed to deactivate user", error=str(e), user_id=user_id)
            return False


async def get_user_service(db: AsyncSession) -> UserService:
    """Get user service instance."""
    return UserService(db) 