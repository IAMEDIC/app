"""
Doctor endpoints for profile management.
"""

import logging
from typing import Optional, cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User as UserModel
from app.models.doctor_profile import DoctorProfileStatus
from app.schemas.doctor_profile import DoctorProfile, DoctorProfileCreate
from app.services.doctor_service import DoctorService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/register", response_model=DoctorProfile)
async def register_doctor_profile(
    profile_data: DoctorProfileCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    """Register doctor profile information"""
    logger.info("📝 User %s registering doctor profile", current_user.email)
    doctor_service = DoctorService(db)
    user_id = cast(UUID, current_user.id)
    existing_profile = doctor_service.get_doctor_profile_by_user_id(user_id)
    if existing_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Doctor profile already exists for this user"
        )
    profile = doctor_service.create_doctor_profile(user_id, profile_data)
    logger.info("📝 Doctor profile created for user %s with status %s", 
               current_user.email, profile.status)
    return profile


@router.get("/profile", response_model=Optional[DoctorProfile])
async def get_my_doctor_profile(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    """Get current user's doctor profile"""
    doctor_service = DoctorService(db)
    user_id = cast(UUID, current_user.id)
    profile = doctor_service.get_doctor_profile_by_user_id(user_id)
    return profile


@router.put("/profile", response_model=DoctorProfile)
async def update_my_doctor_profile(
    profile_data: DoctorProfileCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    """Update current user's doctor profile (only if pending)"""
    doctor_service = DoctorService(db)
    user_id = cast(UUID, current_user.id)
    # Get existing profile
    existing_profile = doctor_service.get_doctor_profile_by_user_id(user_id)
    if not existing_profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor profile not found"
        )
    # Only allow updates if profile is still pending
    if existing_profile.status != DoctorProfileStatus.PENDING.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot update profile after it has been reviewed"
        )
    # Update profile
    profile = doctor_service.update_doctor_profile(user_id, profile_data)
    logger.info("📝 Doctor profile updated for user %s", current_user.email)
    return profile
