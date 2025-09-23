"""
Study endpoints for study management.
"""


import logging
from typing import cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_doctor_role
from app.models.user import User as UserModel
from app.schemas.study import (
    Study, StudyCreate, StudyUpdate, StudyListResponse, StudyWithMedia
)
from app.schemas.media import MediaSummary, StorageInfo
from app.services.study_service import StudyService
from app.services.media_service import MediaService


logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/", response_model=Study)
async def create_study(
    study_data: StudyCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Create a new study"""
    logger.info("🔬 Doctor %s creating study with alias '%s'", current_user.email, study_data.alias)
    study_service = StudyService(db)
    doctor_id = cast(UUID, current_user.id)
    try:
        study = study_service.create_study(doctor_id, study_data)
        logger.info("🔬 Study created successfully: %s", study.id)
        return study
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        ) from e


@router.get("/", response_model=StudyListResponse)
async def list_studies(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Get list of studies for the current doctor"""
    logger.info("🔬 Doctor %s requesting studies list (page %d, size %d)", 
               current_user.email, page, page_size)
    study_service = StudyService(db)
    doctor_id = cast(UUID, current_user.id)
    skip = (page - 1) * page_size
    studies_models = study_service.get_studies_by_doctor(doctor_id, skip=skip, limit=page_size)
    studies = [Study.model_validate(study) for study in studies_models]
    total = study_service.count_studies_by_doctor(doctor_id)
    return StudyListResponse(
        studies=studies,
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/{study_id}", response_model=StudyWithMedia)
async def get_study(
    study_id: UUID,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Get a specific study with its media"""
    logger.info("🔬 Doctor %s requesting study %s", current_user.email, study_id)
    study_service = StudyService(db)
    media_service = MediaService(db)
    doctor_id = cast(UUID, current_user.id)
    study = study_service.get_study_by_id(study_id, doctor_id)
    if not study:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study not found"
        )
    # Get media for the study
    media_list = media_service.get_media_by_study(study_id, doctor_id)
    media_summaries = [MediaSummary.model_validate(media) for media in media_list]
    # Create response with media
    study_dict = Study.model_validate(study).model_dump()
    study_dict["media"] = media_summaries
    return StudyWithMedia(**study_dict)


@router.put("/{study_id}", response_model=Study)
async def update_study(
    study_id: UUID,
    study_data: StudyUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Update a study"""
    logger.info("🔬 Doctor %s updating study %s", current_user.email, study_id)
    study_service = StudyService(db)
    doctor_id = cast(UUID, current_user.id)
    try:
        study = study_service.update_study(study_id, doctor_id, study_data)
        if not study:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Study not found"
            )
        logger.info("🔬 Study updated successfully: %s", study_id)
        return study
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        ) from e


@router.delete("/{study_id}")
async def delete_study(
    study_id: UUID,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Delete a study (soft delete)"""
    logger.info("🔬 Doctor %s deleting study %s", current_user.email, study_id)
    study_service = StudyService(db)
    doctor_id = cast(UUID, current_user.id)
    success = study_service.delete_study(study_id, doctor_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study not found"
        )
    logger.info("🔬 Study deleted successfully: %s", study_id)
    return {"message": "Study deleted successfully"}


@router.get("/storage/info", response_model=StorageInfo)
async def get_storage_info(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Get storage usage information for the current doctor"""
    logger.info("📊 Doctor %s requesting storage info", current_user.email)
    media_service = MediaService(db)
    doctor_id = cast(UUID, current_user.id)
    storage_info = media_service.get_storage_info(doctor_id)
    return StorageInfo(**storage_info)
