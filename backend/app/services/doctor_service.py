"""
Doctor service for doctor profile management operations.
"""


import logging
from typing import Optional, cast
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy import Column

from app.models.doctor_profile import DoctorProfile as DoctorProfileModel, DoctorProfileStatus
from app.models.user_role import UserRole, UserRoleType
from app.schemas.doctor_profile import DoctorProfile as DoctorProfileSchema, DoctorProfileCreate


logger = logging.getLogger(__name__)


class DoctorService:
    """Service class for doctor operations"""

    def __init__(self, db: Session):
        self.db = db

    def create_doctor_profile(
        self,
        user_id: UUID,
        profile_data: DoctorProfileCreate
    ) -> DoctorProfileSchema:
        """Create a new doctor profile"""
        existing_profile = self.db.query(DoctorProfileModel).filter(
            DoctorProfileModel.matriculation_id == profile_data.matriculation_id
        ).first()
        if existing_profile:
            raise ValueError("Matriculation ID already exists")
        db_profile = DoctorProfileModel(
            user_id=user_id,
            matriculation_id=profile_data.matriculation_id,
            legal_name=profile_data.legal_name,
            specialization=profile_data.specialization,
            status=DoctorProfileStatus.PENDING.value
        )
        self.db.add(db_profile)
        self.db.commit()
        self.db.refresh(db_profile)
        logger.info("📝 Doctor profile created for user %s", user_id)
        return DoctorProfileSchema.model_validate(db_profile)

    def get_doctor_profile_by_user_id(self, user_id: UUID) -> Optional[DoctorProfileSchema]:
        """Get doctor profile by user ID"""
        profile = self.db.query(DoctorProfileModel).filter(
            DoctorProfileModel.user_id == user_id
        ).first()
        return DoctorProfileSchema.model_validate(profile) if profile else None

    def update_doctor_profile(
        self,
        user_id: UUID,
        profile_data: DoctorProfileCreate
    ) -> Optional[DoctorProfileSchema]:
        """Update an existing doctor profile"""
        profile = self.db.query(DoctorProfileModel).filter(
            DoctorProfileModel.user_id == user_id
        ).first()
        if not profile:
            return None
        if profile_data.matriculation_id != profile.matriculation_id:
            existing_profile = self.db.query(DoctorProfileModel).filter(
                DoctorProfileModel.matriculation_id == profile_data.matriculation_id,
                DoctorProfileModel.user_id != user_id
            ).first()
            if existing_profile:
                raise ValueError("Matriculation ID already exists")
        profile.matriculation_id = cast(Column[str], profile_data.matriculation_id)
        profile.legal_name = cast(Column[str], profile_data.legal_name)
        profile.specialization = cast(Column[str], profile_data.specialization)
        profile.status = cast(Column[str], DoctorProfileStatus.PENDING.value)
        profile.notes = cast(Column[str], None)
        self.db.commit()
        self.db.refresh(profile)
        logger.info("📝 Doctor profile updated for user %s", user_id)
        return DoctorProfileSchema.model_validate(profile)

    def is_doctor(self, user_id: UUID) -> bool:
        """Check if user has doctor role"""
        doctor_role = self.db.query(UserRole).filter(
            UserRole.user_id == user_id,
            UserRole.role == UserRoleType.DOCTOR
        ).first()
        return doctor_role is not None
