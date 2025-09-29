"""
Frame endpoints for video frame extraction and management.
"""

import logging
from typing import cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_doctor_role
from app.models.user import User as UserModel
from app.services.frame_service import FrameService
from app.services.media_service import MediaService
from app.schemas.frame import (
    FrameCreateRequest, FrameCreateResponse, FrameListResponse, 
    VideoMetadata, FrameSummary, AutoExtractionRequest, AutoExtractionResponse,
    AutoExtractionParams
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/studies/{study_id}/media/{video_id}/metadata", response_model=VideoMetadata)
async def get_video_metadata(
    study_id: UUID,
    video_id: UUID,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Get video metadata for frame extraction"""
    logger.info("📊 Doctor %s requesting video metadata for %s", current_user.email, video_id)
    
    frame_service = FrameService(db)
    doctor_id = cast(UUID, current_user.id)
    
    # Get video metadata
    metadata = frame_service.get_video_metadata(video_id)
    if not metadata:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video not found or unable to read metadata"
        )
    
    return metadata


@router.post("/studies/{study_id}/media/{video_id}/frames", response_model=FrameCreateResponse)
async def extract_frame(
    study_id: UUID,
    video_id: UUID,
    request: FrameCreateRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Extract a frame from video at specified timestamp"""
    logger.info("🎬 Doctor %s extracting frame from video %s at %s seconds", 
                current_user.email, video_id, request.timestamp_seconds)
    
    frame_service = FrameService(db)
    doctor_id = cast(UUID, current_user.id)
    
    # Extract frame
    frame, message = frame_service.extract_frame_at_timestamp(
        video_id, request.timestamp_seconds, doctor_id
    )
    
    if not frame:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message
        )
    
    return FrameCreateResponse(frame=frame, message=message)


@router.get("/studies/{study_id}/media/{video_id}/frames", response_model=FrameListResponse)
async def list_video_frames(
    study_id: UUID,
    video_id: UUID,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """List all frames extracted from a video"""
    logger.info("📋 Doctor %s listing frames for video %s", current_user.email, video_id)
    
    frame_service = FrameService(db)
    doctor_id = cast(UUID, current_user.id)
    
    # Get frames
    frames = frame_service.list_video_frames(video_id, doctor_id)
    
    # Convert to summary format using Pydantic's from_attributes
    frame_summaries = [FrameSummary.model_validate(frame) for frame in frames]
    
    return FrameListResponse(
        frames=frame_summaries,
        total=len(frame_summaries),
        video_media_id=video_id
    )


@router.get("/frames/{frame_id}/file")
async def get_frame_file(
    frame_id: UUID,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Serve the frame image file"""
    logger.info("🖼️ Doctor %s requesting frame file %s", current_user.email, frame_id)
    
    frame_service = FrameService(db)
    media_service = MediaService(db)
    doctor_id = cast(UUID, current_user.id)
    
    # Get frame
    frame = frame_service.get_frame(frame_id, doctor_id)
    if not frame:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Frame not found"
        )
    
    # Get frame image file
    file_data = media_service.get_media_file(cast(UUID, frame.frame_media_id), doctor_id)
    if not file_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Frame file not found"
        )
    
    file_bytes, mime_type, filename = file_data
    
    return Response(
        content=file_bytes,
        media_type=mime_type,
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )


@router.delete("/frames/{frame_id}")
async def delete_frame(
    frame_id: UUID,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Delete a frame and its associated file"""
    logger.info("🗑️ Doctor %s deleting frame %s", current_user.email, frame_id)
    
    frame_service = FrameService(db)
    doctor_id = cast(UUID, current_user.id)
    
    # Delete frame
    success = frame_service.delete_frame(frame_id, doctor_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Frame not found or access denied"
        )
    
    return {"message": "Frame deleted successfully"}


@router.get("/frames/{frame_id}")
async def get_frame_details(
    frame_id: UUID,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Get frame details"""
    logger.info("📋 Doctor %s requesting frame details for %s", current_user.email, frame_id)
    
    frame_service = FrameService(db)
    doctor_id = cast(UUID, current_user.id)
    
    # Get frame
    frame = frame_service.get_frame(frame_id, doctor_id)
    if not frame:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Frame not found"
        )
    
    return frame


@router.post("/studies/{study_id}/media/{video_id}/frames/auto-extract", response_model=AutoExtractionResponse)
async def auto_extract_frames(
    study_id: UUID,
    video_id: UUID,
    request: AutoExtractionRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Automatically extract frames from video using runs-based algorithm"""
    logger.info("🤖 Doctor %s requesting auto frame extraction for video %s", 
                current_user.email, video_id)
    
    from app.services.auto_frame_service import AutoFrameService, AutoExtractionParams as ServiceParams
    
    auto_frame_service = AutoFrameService(db)
    doctor_id = cast(UUID, current_user.id)
    
    # Use provided parameters or defaults
    if request.params:
        params = request.params
    else:
        params = AutoExtractionParams(
            run_threshold=0.8,
            min_run_length=5,
            prediction_threshold=0.95,
            patience=2
        )
    
    service_params = ServiceParams(
        run_threshold=params.run_threshold,
        min_run_length=params.min_run_length,
        prediction_threshold=params.prediction_threshold,
        patience=params.patience
    )
    
    try:
        # Extract frames automatically
        result = auto_frame_service.extract_frames_auto(video_id, doctor_id, service_params)
        
        # Convert Frame models to Frame schemas
        from app.schemas.frame import Frame as FrameSchema
        frame_schemas = [FrameSchema.model_validate(frame) for frame in result.frames]
        
        return AutoExtractionResponse(
            frames=frame_schemas,
            total_frames_analyzed=result.total_frames_analyzed,
            runs_found=result.runs_found,
            compliant_frames=result.compliant_frames,
            message=f"Successfully extracted {len(result.frames)} frames from {result.runs_found} runs"
        )
        
    except PermissionError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to video"
        )
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error in auto frame extraction: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Auto frame extraction failed. Please try again."
        )