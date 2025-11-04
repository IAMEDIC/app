"""
Media endpoints for media file management.
"""


import logging
from typing import cast
from uuid import UUID
import re

from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Request, Header
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_doctor_role
from app.models.user import User as UserModel
from app.schemas.media import (
    Media, MediaUpdate, MediaListResponse, MediaUploadResponse, MediaSummary
)
from app.services.media_service import MediaService
from app.core.cache import get_redis_cache


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
        filename = file.filename
        # DICOM preprocessing: if .dcm or likely DICOM mime, convert to PNG/MP4 first
        is_dicom = False
        if filename and filename.lower().endswith('.dcm'):
            is_dicom = True
        elif file.content_type in ('application/dicom', 'application/dicom+json', 'application/octet-stream') and filename and filename.lower().endswith('.dcm'):
            is_dicom = True
        if is_dicom:
            from app.services.dicom_handler import process_dicom
            try:
                processed_bytes, out_name, out_mime = process_dicom(file_data, filename)
                # Replace payload with processed standard media
                file_data = processed_bytes
                filename = out_name
            except Exception as dicom_err:
                logger.error("📤 DICOM processing failed: %s", dicom_err)
                raise ValueError(f"DICOM processing failed: {dicom_err}") from dicom_err
        media = media_service.create_media(study_id, doctor_id, file_data, filename)
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
    # Get media info for headers
    media_info = media_service.get_media_info(media_id, doctor_id)
    if not media_info:
        logger.warning("❌ Media file %s not found on disk", media_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media file not found"
        )
    mime_type, filename, file_size = media_info
    
    # Get chunked file generator
    chunk_generator = media_service.get_media_file_chunked(media_id, doctor_id)
    if not chunk_generator:
        logger.warning("❌ Media file %s not found on disk", media_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media file not found"
        )
    
    logger.debug("✅ Successfully serving media file: %s (%s)", filename, mime_type)
    return StreamingResponse(
        chunk_generator,
        media_type=mime_type,
        headers={
            "Content-Disposition": f"attachment; filename=\"{filename}\"",
            "Content-Length": str(file_size),
            "Accept-Ranges": "bytes"
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
    # Get media info for headers
    media_info = media_service.get_media_info(media_id, doctor_id)
    if not media_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media not found"
        )
    mime_type, filename, file_size = media_info
    
    # Get chunked file generator
    chunk_generator = media_service.get_media_file_chunked(media_id, doctor_id)
    if not chunk_generator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media file not found"
        )
    
    return StreamingResponse(
        chunk_generator,
        media_type=mime_type,
        headers={
            "Content-Disposition": f"attachment; filename=\"{filename}\"",
            "Content-Length": str(file_size),
            "Accept-Ranges": "bytes"
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


@router.get("/studies/{study_id}/media/{media_id}/stream")
async def stream_media(
    study_id: UUID,
    media_id: UUID,
    request: Request,
    range: str = Header(None),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Stream media file with HTTP Range request support for efficient loading"""
    logger.debug("🎥 Doctor %s streaming media %s from study %s", current_user.email, media_id, study_id) 
    media_service = MediaService(db)
    doctor_id = cast(UUID, current_user.id)
    
    # Get media info first (lightweight operation)
    media_info = media_service.get_media_info(media_id, doctor_id)
    if not media_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media not found or access denied"
        )
    
    mime_type, filename, file_size = media_info
    
    # Verify media belongs to the correct study
    media = media_service.get_media_by_id(media_id, doctor_id)
    if not media:
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
    
    # Parse Range header if present
    start = 0
    end = file_size - 1
    status_code = 200
    
    if range:
        try:
            range_match = re.match(r'bytes=(\d+)-(\d*)', range)
            if range_match:
                start = int(range_match.group(1))
                if range_match.group(2):
                    end = min(int(range_match.group(2)), file_size - 1)
                else:
                    # If end is not specified, serve from start to end of file
                    end = file_size - 1
                status_code = 206  # Partial Content
            else:
                logger.warning("❌ Invalid range header format: %s", range)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid range header format: {range}"
                )
        except (ValueError, IndexError) as e:
            logger.warning("❌ Failed to parse range header %s: %s", range, e)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid range header: {range}"
            ) from e
    
    # Validate range
    if start >= file_size or end >= file_size or start > end:
        raise HTTPException(
            status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
            detail=f"Invalid range: {start}-{end} for file size {file_size}"
        )
    
    # Get the requested range of data
    try:
        range_data = media_service.get_media_file_range(media_id, doctor_id, start, end)
        if not range_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Media file not found on disk"
            )
    except Exception as e:
        logger.error("❌ Failed to read file range %s-%s for media %s: %s", start, end, media_id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to read media file"
        ) from e
    
    file_data, _, _, _ = range_data
    content_length = end - start + 1
    
    # Prepare headers
    headers = {
        'Accept-Ranges': 'bytes',
        'Content-Length': str(content_length),
        'Content-Type': mime_type,
    }
    
    if status_code == 206:
        headers['Content-Range'] = f'bytes {start}-{end}/{file_size}'
    
    logger.debug("✅ Serving media range %s-%s/%s (%s bytes)", start, end, file_size, content_length)
    
    return Response(
        content=file_data,
        status_code=status_code,
        headers=headers
    )


@router.get("/studies/{study_id}/media/{media_id}/video-stream")
async def stream_video(
    study_id: UUID,
    media_id: UUID,
    request: Request,
    range: str = Header(None),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """
    Enhanced video streaming endpoint optimized for video playback.
    Provides better caching headers and video-specific optimizations.
    """
    logger.debug("🎬 Doctor %s streaming video %s from study %s", current_user.email, media_id, study_id) 
    media_service = MediaService(db)
    doctor_id = cast(UUID, current_user.id)
    
    # Get media info first (lightweight operation)
    media_info = media_service.get_media_info(media_id, doctor_id)
    if not media_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media not found or access denied"
        )
    
    mime_type, filename, file_size = media_info
    
    # Ensure this is a video file
    if not mime_type.startswith('video/'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This endpoint is only for video files"
        )
    
    # Verify media belongs to the correct study
    media = media_service.get_media_by_id(media_id, doctor_id)
    if not media:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media not found or access denied"
        )
    if str(media.study_id) != str(study_id):
        logger.warning("❌ Video %s belongs to study %s, not %s", media_id, media.study_id, study_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video not found in the specified study"
        )
    
    # Parse Range header if present
    start = 0
    end = file_size - 1
    status_code = 200
    
    if range:
        try:
            range_match = re.match(r'bytes=(\d+)-(\d*)', range)
            if range_match:
                start = int(range_match.group(1))
                if range_match.group(2):
                    end = min(int(range_match.group(2)), file_size - 1)
                else:
                    # For video streaming, limit chunk size to 1MB for better progressive loading
                    chunk_size = 1024 * 1024  # 1MB
                    end = min(start + chunk_size - 1, file_size - 1)
                status_code = 206  # Partial Content
            else:
                logger.warning("❌ Invalid range header format: %s", range)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid range header format: {range}"
                )
        except (ValueError, IndexError) as e:
            logger.warning("❌ Failed to parse range header %s: %s", range, e)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid range header: {range}"
            ) from e
    
    # Validate range
    if start >= file_size or end >= file_size or start > end:
        raise HTTPException(
            status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
            detail=f"Invalid range: {start}-{end} for file size {file_size}"
        )
    
    # Get the requested range of data
    try:
        range_data = media_service.get_media_file_range(media_id, doctor_id, start, end)
        if not range_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Video file not found on disk"
            )
    except Exception as e:
        logger.error("❌ Failed to read video range %s-%s for media %s: %s", start, end, media_id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to read video file"
        ) from e
    
    file_data, _, _, _ = range_data
    content_length = end - start + 1
    
    # Enhanced headers for video streaming
    headers = {
        'Accept-Ranges': 'bytes',
        'Content-Length': str(content_length),
        'Content-Type': mime_type,
        'Cache-Control': 'public, max-age=3600',  # Cache for 1 hour
        'X-Content-Type-Options': 'nosniff',
        'X-Video-Optimized': 'true',  # Custom header to indicate video optimization
    }
    
    if status_code == 206:
        headers['Content-Range'] = f'bytes {start}-{end}/{file_size}'
    
    logger.debug("✅ Serving video range %s-%s/%s (%s bytes)", start, end, file_size, content_length)
    
    return Response(
        content=file_data,
        status_code=status_code,
        headers=headers
    )


@router.get("/studies/{study_id}/media/{media_id}/video-thumbnails")
async def get_video_thumbnails(
    study_id: UUID,
    media_id: UUID,
    thumbnail_count: int = 20,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """
    Generate thumbnail strip for video scrubbing interface.
    Returns evenly distributed thumbnails across the video timeline.
    """
    logger.debug("🖼️ Doctor %s requesting video thumbnails for %s", current_user.email, media_id)
    
    from app.services.auto_frame_service import AutoFrameService
    
    auto_frame_service = AutoFrameService(db)
    doctor_id = cast(UUID, current_user.id)
    
    # Validate thumbnail count
    if thumbnail_count < 5 or thumbnail_count > 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Thumbnail count must be between 5 and 50"
        )
    
    try:
        thumbnails = await auto_frame_service.generate_video_thumbnails(
            video_media_id=media_id,
            doctor_id=doctor_id,
            study_id=study_id,
            thumbnail_count=thumbnail_count
        )
        
        logger.info("✅ Generated %d thumbnails for video %s", len(thumbnails), media_id)
        
        return {
            "thumbnails": thumbnails,
            "count": len(thumbnails),
            "video_id": str(media_id)
        }
        
    except PermissionError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video file not found"
        )
    except Exception as e:
        logger.error("❌ Error generating video thumbnails: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate video thumbnails"
        )


@router.get("/studies/{study_id}/media/{media_id}/preview-frame")
async def get_video_preview_frame(
    study_id: UUID,
    media_id: UUID,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """
    Get a preview frame thumbnail for a video (extracted at 0.5s).
    Returns a small JPEG thumbnail (max 320x240) with browser caching headers.
    Uses Redis + filesystem caching for performance.
    """
    logger.debug("🖼️ Doctor %s requesting preview frame for video %s", current_user.email, media_id)
    
    media_service = MediaService(db)
    doctor_id = cast(UUID, current_user.id)
    
    # Verify media belongs to the correct study
    media = media_service.get_media_by_id(media_id, doctor_id)
    if not media:
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
    
    # Get Redis cache instance
    cache = get_redis_cache()
    
    # Extract or retrieve cached preview frame
    preview_data = media_service.get_video_preview_frame(media_id, doctor_id, cache)
    
    if not preview_data:
        # Silent failure - return 404 so frontend can fallback to icon
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Preview frame not available"
        )
    
    logger.debug("✅ Serving preview frame for video %s (%.1f KB)", media_id, len(preview_data) / 1024)
    
    # Return JPEG with aggressive browser caching
    return Response(
        content=preview_data,
        media_type="image/jpeg",
        headers={
            "Cache-Control": "public, max-age=86400, immutable",  # Cache for 24 hours
            "X-Content-Type-Options": "nosniff",
            "Content-Length": str(len(preview_data))
        }
    )
