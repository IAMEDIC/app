"""
Study service for business logic operations.
"""


import logging
from typing import List, Optional
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy import and_, func

from app.models.study import Study
from app.models.media import Media
from app.schemas.study import StudyCreate, StudyUpdate
from app.services.user_service import UserService


logger = logging.getLogger(__name__)


class StudyService:
    """Service class for study operations"""

    def __init__(self, db: Session):
        self.db = db
        self.user_service = UserService(db)

    def create_study(self, doctor_id: UUID, study_data: StudyCreate) -> Study:
        """
        Create a new study for a doctor.
        Args:
            doctor_id: ID of the doctor creating the study
            study_data: Study creation data
        Returns:
            Created study
        Raises:
            ValueError: If alias already exists for this doctor
        """
        # Check if alias already exists for this doctor
        existing = self.db.query(Study).filter(
            and_(
                Study.doctor_id == doctor_id,
                Study.alias == study_data.alias,
                Study.is_active
            )
        ).first()
        if existing:
            raise ValueError(f"Study with alias '{study_data.alias}' already exists")
        # Create new study
        db_study = Study(
            doctor_id=doctor_id,
            alias=study_data.alias
        )
        self.db.add(db_study)
        self.db.commit()
        self.db.refresh(db_study)
        logger.info("Created study %s for doctor %s", db_study.id, doctor_id)
        return db_study

    def get_study_by_id(self, study_id: UUID, doctor_id: UUID) -> Optional[Study]:
        """
        Get a study by ID, ensuring it belongs to the doctor.
        Args:
            study_id: ID of the study
            doctor_id: ID of the doctor
        Returns:
            Study if found and belongs to doctor, None otherwise
        """
        return self.db.query(Study).filter(
            and_(
                Study.id == study_id,
                Study.doctor_id == doctor_id,
                Study.is_active
            )
        ).first()

    def get_studies_by_doctor(
        self,
        doctor_id: UUID,
        skip: int = 0,
        limit: int = 100,
        active_only: bool = True
    ) -> List[Study]:
        """
        Get all studies for a doctor with pagination.
        Args:
            doctor_id: ID of the doctor
            skip: Number of records to skip
            limit: Maximum number of records to return
            active_only: Whether to return only active studies
        Returns:
            List of studies
        """
        query = self.db.query(Study).filter(Study.doctor_id == doctor_id)
        if active_only:
            query = query.filter(Study.is_active)
        return query.order_by(Study.created_at.desc()).offset(skip).limit(limit).all()

    def count_studies_by_doctor(self, doctor_id: UUID, active_only: bool = True) -> int:
        """
        Count total studies for a doctor.
        Args:
            doctor_id: ID of the doctor
            active_only: Whether to count only active studies
        Returns:
            Total number of studies
        """
        # pylint: disable=not-callable
        query = self.db.query(func.count(Study.id)).filter(Study.doctor_id == doctor_id)
        if active_only:
            query = query.filter(Study.is_active)
        return query.scalar()

    def update_study(
        self,
        study_id: UUID,
        doctor_id: UUID,
        study_data: StudyUpdate
    ) -> Optional[Study]:
        """
        Update a study.
        Args:
            study_id: ID of the study
            doctor_id: ID of the doctor
            study_data: Study update data
        Returns:
            Updated study if found and belongs to doctor, None otherwise
        Raises:
            ValueError: If new alias already exists for this doctor
        """
        # Get the study
        db_study = self.get_study_by_id(study_id, doctor_id)
        if not db_study:
            return None
        # Check if new alias conflicts with existing studies
        if study_data.alias and study_data.alias != db_study.alias:
            existing = self.db.query(Study).filter(
                and_(
                    Study.doctor_id == doctor_id,
                    Study.alias == study_data.alias,
                    Study.is_active,
                    Study.id != study_id
                )
            ).first()
            if existing:
                raise ValueError(f"Study with alias '{study_data.alias}' already exists")
        # Update study fields
        update_data = study_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_study, field, value)
        self.db.commit()
        self.db.refresh(db_study)
        logger.info("Updated study %s for doctor %s", study_id, doctor_id)
        return db_study

    def delete_study(self, study_id: UUID, doctor_id: UUID) -> bool:
        """
        Soft delete a study.
        Args:
            study_id: ID of the study
            doctor_id: ID of the doctor
        Returns:
            True if study was deleted, False if not found
        """
        db_study = self.get_study_by_id(study_id, doctor_id)
        if not db_study:
            return False
        # Soft delete
        db_study.is_active = False # type: ignore
        self.db.commit()
        logger.info("Soft deleted study %s for doctor %s", study_id, doctor_id)
        return True

    def get_study_with_media_count(self, study_id: UUID, doctor_id: UUID) -> Optional[dict]:
        """
        Get study with media count.
        Args:
            study_id: ID of the study
            doctor_id: ID of the doctor
        Returns:
            Dictionary with study data and media count
        """
        study = self.get_study_by_id(study_id, doctor_id)
        if not study:
            return None
        # pylint: disable=not-callable
        media_count = self.db.query(func.count(Media.id)).filter(
            Media.study_id == study_id
        ).scalar()
        return {
            "id": study.id,
            "alias": study.alias,
            "media_count": media_count,
            "created_at": study.created_at,
            "updated_at": study.updated_at
        }
