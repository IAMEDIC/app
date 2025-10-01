"""
Streaming endpoints for real-time video capture and frame processing.
"""


import logging
from typing import cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_doctor_role
from app.models.user import User as UserModel
from app.services.realtime_streaming_service import RealTimeStreamingService
from app.schemas.streaming import (
    StreamingSessionResponse,
    StreamingSessionInfo,
    FrameProcessingResponse,
    StreamingSessionFinalizeResponse
)


logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/studies/{study_id}/streaming/sessions", response_model=StreamingSessionResponse)
async def create_streaming_session(
    study_id: UUID,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Create a new streaming session"""
    logger.debug("📺 Doctor %s creating streaming session for study %s", current_user.email, study_id)
    streaming_service = RealTimeStreamingService(db)
    doctor_id = cast(UUID, current_user.id)
    try:
        session_id = await streaming_service.create_streaming_session(study_id, doctor_id)
        return StreamingSessionResponse(
            session_id=session_id,
            message="Streaming session created successfully"
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        ) from e
    except Exception as e:
        logger.error("📺 Failed to create streaming session: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create streaming session"
        ) from e


@router.post("/streaming/sessions/{session_id}/chunks")
async def upload_video_chunk(
    session_id: str,
    chunk: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Upload a video chunk to the streaming session"""
    logger.debug("📺 Doctor %s uploading chunk to session %s", current_user.email, session_id)
    streaming_service = RealTimeStreamingService(db)
    try:
        chunk_data = await chunk.read()
        success = await streaming_service.append_video_chunk(session_id, chunk_data)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to append video chunk"
            )
        return {"message": "Chunk uploaded successfully", "size": len(chunk_data)}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        ) from e
    except Exception as e:
        logger.error("📺 Failed to upload chunk: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload video chunk"
        ) from e


@router.post("/streaming/sessions/{session_id}/frames", response_model=FrameProcessingResponse)
async def process_frame(
    session_id: str,
    frame: UploadFile = File(...),
    timestamp_seconds: float = 0.0,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Process a frame for real-time analysis"""
    logger.info("� FRAME PROCESSING ENDPOINT HIT - Doctor %s processing frame for session %s at %ss", 
                current_user.email, session_id, timestamp_seconds)
    logger.info("🔥 Frame file size: %s bytes, content type: %s", 
                frame.size if hasattr(frame, 'size') else 'unknown', frame.content_type)
    streaming_service = RealTimeStreamingService(db)
    try:
        frame_data = await frame.read()
        result = await streaming_service.process_frame_realtime(
            session_id, frame_data, timestamp_seconds
        )
        return FrameProcessingResponse(
            is_useful_frame=result.is_useful_frame,
            confidence=result.confidence_score,
            frame_extracted=result.should_extract,
            frame_id=str(result.extracted_frame_id) if result.extracted_frame_id else None,
            frame_media_id=str(result.extracted_frame_media_id) if result.extracted_frame_media_id else None,
            processing_time_ms=result.processing_time_ms
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        ) from e
    except Exception as e:
        logger.error("📺 Failed to process frame: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process frame"
        ) from e


@router.get("/streaming/sessions/{session_id}", response_model=StreamingSessionInfo)
async def get_streaming_session_info(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Get information about a streaming session"""
    logger.debug("📺 Doctor %s requesting info for session %s", current_user.email, session_id)
    streaming_service = RealTimeStreamingService(db)
    try:
        session_info = streaming_service.get_session_info(session_id)
        if not session_info:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Streaming session not found"
            )
        return StreamingSessionInfo(**session_info)
    except Exception as e:
        logger.error("📺 Failed to get session info: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get session information"
        ) from e


@router.post("/streaming/sessions/{session_id}/finalize", response_model=StreamingSessionFinalizeResponse)
async def finalize_streaming_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Finalize a streaming session"""
    logger.debug("📺 Doctor %s finalizing session %s", current_user.email, session_id)
    streaming_service = RealTimeStreamingService(db)
    try:
        video_media_id = await streaming_service.finalize_streaming_session(session_id)
        if not video_media_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to finalize streaming session"
            )
        return StreamingSessionFinalizeResponse(
            video_media_id=str(video_media_id),
            message="Streaming session finalized successfully"
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        ) from e
    except Exception as e:
        logger.error("📺 Failed to finalize session: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to finalize streaming session"
        ) from e


@router.delete("/streaming/sessions/{session_id}")
async def cancel_streaming_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Cancel a streaming session"""
    logger.debug("📺 Doctor %s canceling session %s", current_user.email, session_id)
    streaming_service = RealTimeStreamingService(db)
    try:
        await streaming_service.finalize_streaming_session(session_id)
        return {"message": "Streaming session canceled successfully"}
    except Exception as e:
        logger.error("📺 Failed to cancel session: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to cancel streaming session"
        ) from e
