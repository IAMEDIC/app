"""
Dependency utilities for FastAPI routes.
Includes authentication and database session management.
"""


import logging
from typing import Optional, cast
from uuid import UUID

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import verify_token
from app.services.user_service import UserService
from app.services.admin_service import AdminService
from app.models.user import User


logger = logging.getLogger(__name__)
security = HTTPBearer()

credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """Get current authenticated user"""
    logger.debug("🔍 Verifying user authentication")
    try:
        token = credentials.credentials
        email = verify_token(token)
        if email is None:
            logger.warning("⚠️ Invalid token provided")
            raise credentials_exception
    except Exception as e:
        logger.warning("⚠️ Token verification failed: %s", str(e))
        raise credentials_exception from e
    user_service = UserService(db)
    user = user_service.get_by_email(email)
    if user is None:
        logger.warning("⚠️ User not found for email: %s", email)
        raise credentials_exception
    if user.is_active is False:
        logger.warning("⚠️ Inactive user attempted access: %s", email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Inactive user"
        )
    logger.debug("✅ User authenticated successfully: %s", email)
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Get current active user (alias for clarity)"""
    return current_user


def get_optional_current_user(
    request: Request,
    db: Session = Depends(get_db)
) -> Optional[User]:
    """Get current user if authenticated, None otherwise"""
    # Check if Authorization header exists
    auth_header = request.headers.get("authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        logger.debug("🔍 No valid authorization header found")
        return None
    try:
        token = auth_header.split(" ")[1]
        email = verify_token(token)
        if email is None:
            logger.debug("🔍 Invalid token in optional auth")
            return None
        user_service = UserService(db)
        user = user_service.get_by_email(email)
        if user is None or user.is_active is False:
            logger.debug("🔍 User not found or inactive in optional auth: %s", email)
            return None
        logger.debug("✅ Optional auth successful: %s", email)
        return user
    except Exception as e: # pylint: disable=broad-except
        logger.debug("🔍 Optional auth failed: %s", str(e))
        return None

async def require_admin_role(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> User:
    """Require admin role for access"""
    admin_service = AdminService(db)
    user_id = cast(UUID, current_user.id)
    if not admin_service.is_admin(user_id):
        logger.warning("⚠️ Non-admin user attempted admin access: %s", current_user.email)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required"
        )
    logger.debug("✅ Admin access granted: %s", current_user.email)
    return current_user
