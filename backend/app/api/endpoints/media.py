"""
Media endpoints for media file management.
"""


import logging
from typing import cast
from uuid import UUID
import io

from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_doctor_role
from app.models.user import User as UserModel
from app.schemas.media import (
    Media, MediaUpdate, MediaListResponse, MediaUploadResponse, MediaSummary
)
from app.services.media_service import MediaService


logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/studies/{study_id}/media", response_model=MediaUploadResponse)
async def upload_media(
    study_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Upload a media file to a study"""
    logger.debug("📤 Doctor %s uploading media to study %s", current_user.email, study_id)
    media_service = MediaService(db)
    doctor_id = cast(UUID, current_user.id)
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No filename provided"
        )
    try:
        file_data = await file.read()
        media = media_service.create_media(study_id, doctor_id, file_data, file.filename)
        logger.debug("📤 Media uploaded successfully: %s", media.id)
        return MediaUploadResponse(
            media=Media.model_validate(media),
            message="Media uploaded successfully"
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        ) from e
    except Exception as e:
        logger.error("📤 Failed to upload media: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload media"
        ) from e


@router.get("/studies/{study_id}/media", response_model=MediaListResponse)
async def list_media(
    study_id: UUID,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Get list of media files for a study"""
    logger.debug("📋 Doctor %s requesting media list for study %s", current_user.email, study_id)
    media_service = MediaService(db)
    doctor_id = cast(UUID, current_user.id)
    media_list = media_service.get_media_by_study(study_id, doctor_id)
    if not media_list and not media_service.check_study_ownership(study_id, doctor_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study not found"
        )
    media_summaries = [MediaSummary.model_validate(media) for media in media_list]
    return MediaListResponse(
        media=media_summaries,
        total=len(media_summaries),
        study_id=study_id
    )


@router.get("/media/{media_id}", response_model=Media)
async def get_media(
    media_id: UUID,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Get media information"""
    logger.debug("📋 Doctor %s requesting media %s", current_user.email, media_id)
    media_service = MediaService(db)
    doctor_id = cast(UUID, current_user.id)
    media = media_service.get_media_by_id(media_id, doctor_id)
    if not media:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media not found"
        )
    return Media.model_validate(media)


@router.get("/studies/{study_id}/media/{media_id}/download")
async def download_study_media(
    study_id: UUID,
    media_id: UUID,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Download a media file from a specific study"""
    logger.debug("⬇️ Doctor %s downloading media %s from study %s", current_user.email, media_id, study_id)
    media_service = MediaService(db)
    doctor_id = cast(UUID, current_user.id)
    media = media_service.get_media_by_id(media_id, doctor_id)
    logger.debug("🔍 Media query result: %s", media)
    if not media:
        logger.warning("❌ Media %s not found for doctor %s", media_id, doctor_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media not found or access denied"
        )
    logger.debug("🔍 Media study_id: %s, Expected study_id: %s", media.study_id, study_id)
    if str(media.study_id) != str(study_id):
        logger.warning("❌ Media %s belongs to study %s, not %s", media_id, media.study_id, study_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media not found in the specified study"
        )
    file_data = media_service.get_media_file(media_id, doctor_id)
    if not file_data:
        logger.warning("❌ Media file %s not found on disk", media_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media file not found"
        )
    file_bytes, mime_type, filename = file_data
    logger.debug("✅ Successfully serving media file: %s (%s)", filename, mime_type)
    return StreamingResponse(
        io.BytesIO(file_bytes),
        media_type=mime_type,
        headers={
            "Content-Disposition": f"attachment; filename=\"{filename}\""
        }
    )


@router.get("/media/{media_id}/download")
async def download_media(
    media_id: UUID,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Download a media file"""
    logger.debug("⬇️ Doctor %s downloading media %s", current_user.email, media_id)
    media_service = MediaService(db)
    doctor_id = cast(UUID, current_user.id)
    file_data = media_service.get_media_file(media_id, doctor_id)
    if not file_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media not found"
        )
    file_bytes, mime_type, filename = file_data
    return StreamingResponse(
        io.BytesIO(file_bytes),
        media_type=mime_type,
        headers={
            "Content-Disposition": f"attachment; filename=\"{filename}\""
        }
    )


@router.put("/media/{media_id}", response_model=Media)
async def update_media(
    media_id: UUID,
    media_data: MediaUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Update media information"""
    logger.debug("✏️ Doctor %s updating media %s", current_user.email, media_id)
    media_service = MediaService(db)
    doctor_id = cast(UUID, current_user.id)
    media = media_service.update_media(media_id, doctor_id, media_data)
    if not media:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media not found"
        )
    logger.info("✏️ Media updated successfully: %s", media_id)
    return Media.model_validate(media)


@router.delete("/studies/{study_id}/media/{media_id}")
async def delete_study_media(
    study_id: UUID,
    media_id: UUID,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Delete a media file from a specific study (soft delete)"""
    logger.debug("🗑️ Doctor %s deleting media %s from study %s", current_user.email, media_id, study_id)
    media_service = MediaService(db)
    doctor_id = cast(UUID, current_user.id)
    media = media_service.get_media_by_id(media_id, doctor_id)
    if not media:
        logger.warning("❌ Media %s not found for doctor %s", media_id, doctor_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media not found or access denied"
        )
    if str(media.study_id) != str(study_id):
        logger.warning("❌ Media %s belongs to study %s, not %s", media_id, media.study_id, study_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media not found in the specified study"
        )
    success = media_service.delete_media(media_id, doctor_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media not found"
        )
    logger.info("🗑️ Media deleted successfully: %s", media_id)
    return {"message": "Media deleted successfully"}
