"""
Dependency utilities for FastAPI routes.
Includes authentication and database session management.
"""


import logging
from typing import Optional, cast
from uuid import UUID

from fastapi import Depends, HTTPException, status, Request

from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import verify_token
from app.services.user_service import UserService
from app.services.admin_service import AdminService
from app.services.doctor_service import DoctorService
from app.services.session_service import SessionService
from app.models.user import User


logger = logging.getLogger(__name__)

credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    request: Request,
    db: Session = Depends(get_db)
) -> User:
    """Get current authenticated user from httpOnly cookie"""
    logger.debug("🔍 Starting user authentication verification")
    
    # Try to get token from httpOnly cookie first
    token = request.cookies.get("access_token")
    
    # Fallback to Authorization header for API compatibility
    if not token:
        auth_header = request.headers.get("authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
    
    if not token:
        logger.warning("⚠️ No token found in cookie or header")
        raise credentials_exception
    
    try:
        logger.debug("🔍 Token received, verifying...")
        email = verify_token(token)
        if email is None:
            logger.warning("⚠️ Invalid token provided")
            raise credentials_exception
        logger.debug("🔍 Token valid for email: %s", email)
    except Exception as e:
        logger.debug("⚠️ Token verification failed: %s", str(e))
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
    
    # Check session validity and update activity
    try:
        from app.services.session_service import SessionService
        session_service = SessionService()
        if not session_service.is_session_active(str(user.id)):
            logger.warning("⚠️ User session expired: %s", email)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired due to inactivity"
            )
        # Update last activity
        session_service.update_activity(str(user.id))
    except ImportError:
        # Fallback if session service is not available
        pass
    except Exception as e:
        logger.warning("⚠️ Session check failed for user %s: %s", email, str(e))
        # Don't fail the request, just log the issue
        
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
    # Try to get token from httpOnly cookie first
    token = request.cookies.get("access_token")
    
    # Fallback to Authorization header
    if not token:
        auth_header = request.headers.get("authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
    
    if not token:
        logger.debug("🔍 No token found in cookie or header")
        return None
        
    try:
        email = verify_token(token)
        if email is None:
            logger.debug("🔍 Invalid token in optional auth")
            return None
        user_service = UserService(db)
        user = user_service.get_by_email(email)
        if user is None or user.is_active is False:
            logger.debug("🔍 User not found or inactive in optional auth: %s", email)
            return None
            
        # Update session activity for valid users
        try:
            session_service = SessionService()
            session_service.update_activity(str(user.id))
        except Exception as e:
            logger.debug("⚠️ Failed to update session activity: %s", str(e))
            
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


async def require_doctor_role(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> User:
    """Require doctor role and approved profile for access"""
    logger.debug("🔍 Checking doctor role for user: %s", current_user.email)
    doctor_service = DoctorService(db)
    user_id = cast(UUID, current_user.id)
    is_doctor = doctor_service.is_doctor(user_id)
    logger.debug("🔍 Is doctor check result: %s for user %s", is_doctor, current_user.email)
    if not is_doctor:
        logger.warning("⚠️ Non-doctor user attempted doctor access: %s", current_user.email)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doctor role required"
        )
    doctor_profile = doctor_service.get_doctor_profile_by_user_id(user_id)
    logger.debug("🔍 Doctor profile: %s (status: %s) for user %s",
                doctor_profile.id if doctor_profile else None,
                doctor_profile.status if doctor_profile else "None",
                current_user.email)
    if not doctor_profile or doctor_profile.status != "approved":
        logger.warning("⚠️ Unapproved doctor attempted access: %s (profile status: %s)", 
                      current_user.email, doctor_profile.status if doctor_profile else "None")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Approved doctor profile required"
        )
    logger.debug("✅ Doctor access granted: %s", current_user.email)
    return current_user


async def require_admin_or_doctor_role(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> User:
    """Require either admin or doctor role for access"""
    logger.debug("🔍 Checking admin or doctor role for user: %s", current_user.email)
    
    # Check if user is admin first
    admin_service = AdminService(db)
    user_id = cast(UUID, current_user.id)
    if admin_service.is_admin(user_id):
        logger.debug("✅ Admin access granted: %s", current_user.email)
        return current_user
    
    # If not admin, check if user is an approved doctor
    doctor_service = DoctorService(db)
    is_doctor = doctor_service.is_doctor(user_id)
    if not is_doctor:
        logger.warning("⚠️ User has neither admin nor doctor role: %s", current_user.email)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or doctor role required"
        )
    
    doctor_profile = doctor_service.get_doctor_profile_by_user_id(user_id)
    if not doctor_profile or doctor_profile.status != "approved":
        logger.warning("⚠️ User is doctor but not approved: %s (profile status: %s)", 
                      current_user.email, doctor_profile.status if doctor_profile else "None")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role or approved doctor profile required"
        )
    
    logger.debug("✅ Doctor access granted: %s", current_user.email)
    return current_user
