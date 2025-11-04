"""
Media service for business logic operations.
"""


import logging
import os
import tempfile
from typing import Optional, cast
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy import func
import ffmpeg
from PIL import Image as PILImage

from app.models.media import Media, MediaType, UploadStatus
from app.models.study import Study
from app.schemas.media import MediaCreate, MediaUpdate
from app.core.file_storage import FileStorageService, FileInfo
from app.core.cache import RedisCache


logger = logging.getLogger(__name__)


class MediaService:
    """Service class for media operations"""

    def __init__(self, db: Session, file_storage: Optional[FileStorageService] = None):
        self.db = db
        self.file_storage = file_storage or FileStorageService()

    def check_study_ownership(self, study_id: UUID, doctor_id: UUID) -> bool:
        """
        Check if a study belongs to a doctor.
        Args:
            study_id: ID of the study
            doctor_id: ID of the doctor
        Returns:
            True if study belongs to doctor, False otherwise
        """
        study = self.db.query(Study).filter(
            Study.id == study_id,
            Study.doctor_id == doctor_id,
            Study.is_active
        ).first()
        return study is not None

    def get_doctor_file_ids(self, doctor_id: UUID) -> list[str]:
        """
        Get all file IDs for a doctor's active media.
        Args:
            doctor_id: ID of the doctor
        Returns:
            list of file IDs
        """
        media_files = self.db.query(Media.file_path).join(Study).filter(
            Study.doctor_id == doctor_id,
            Study.is_active,
            Media.is_active
        ).all()
        return [media.file_path for media in media_files]

    def create_media(
        self,
        study_id: UUID,
        doctor_id: UUID,
        file_data: bytes,
        filename: str
    ) -> Media:
        """
        Create a new media file for a study.
        Args:
            study_id: ID of the study
            doctor_id: ID of the doctor
            file_data: Raw file bytes
            filename: Original filename
        Returns:
            Created media object
        Raises:
            ValueError: If study doesn't belong to doctor or storage issues
            OSError: If file cannot be stored
        """
        if not self.check_study_ownership(study_id, doctor_id):
            raise ValueError("Study not found or access denied")
        doctor_file_ids = self.get_doctor_file_ids(doctor_id)
        if not self.file_storage.check_storage_availability(doctor_file_ids, len(file_data)):
            storage_info = self.file_storage.get_storage_info(doctor_file_ids)
            raise ValueError(
                f"Storage limit exceeded. Used: {storage_info['used_mb']:.1f}MB/"
                f"{storage_info['total_mb']:.1f}MB"
            )
        file_info: FileInfo = self.file_storage.create_file(file_data, filename)
        logger.debug("🔍 Step 1 - file_info.media_type: %s (type: %s)", file_info.media_type, type(file_info.media_type))
        media_type_enum = MediaType(file_info.media_type)
        logger.debug("🔍 Step 2 - MediaType enum: %s (type: %s)", media_type_enum, type(media_type_enum))
        media_data = MediaCreate(
            study_id=study_id,
            filename=file_info.filename,
            file_path=file_info.file_id,
            file_size=file_info.file_size,
            mime_type=file_info.mime_type,
            media_type=media_type_enum
        )
        logger.debug("🔍 Step 3 - media_data.media_type: %s (type: %s)", media_data.media_type, type(media_data.media_type))
        model_dump_result = media_data.model_dump(mode='python')
        logger.debug("🔍 Step 4 - model_dump result: %s", model_dump_result)
        db_media = Media(
            study_id=model_dump_result['study_id'],
            filename=model_dump_result['filename'],
            file_path=model_dump_result['file_path'],
            file_size=model_dump_result['file_size'],
            mime_type=model_dump_result['mime_type'],
            media_type=media_type_enum,
            upload_status=UploadStatus.UPLOADED
        )
        logger.debug("🔍 Step 5 - db_media.media_type: %s (type: %s)", db_media.media_type, type(db_media.media_type))
        self.db.add(db_media)
        self.db.commit()
        self.db.refresh(db_media)
        logger.info("Created media %s for study %s", db_media.id, study_id)
        return db_media

    def get_media_by_id(self, media_id: UUID, doctor_id: UUID) -> Optional[Media]:
        """
        Get a media by ID, ensuring it belongs to the doctor.
        Args:
            media_id: ID of the media
            doctor_id: ID of the doctor
        Returns:
            Media if found and belongs to doctor, None otherwise
        """
        return self.db.query(Media).join(Study).filter(
            Media.id == media_id,
            Study.doctor_id == doctor_id,
            Study.is_active,
            Media.is_active
        ).first()

    def get_media_by_study(self, study_id: UUID, doctor_id: UUID) -> list[Media]:
        """
        Get all media for a study, ensuring study belongs to doctor.
        Args:
            study_id: ID of the study
            doctor_id: ID of the doctor
        Returns:
            list of media objects
        """
        if not self.check_study_ownership(study_id, doctor_id):
            return []
        return self.db.query(Media).filter(
            Media.study_id == study_id,
            Media.is_active,
            Media.media_type.in_([MediaType.IMAGE, MediaType.VIDEO])
        ).order_by(Media.created_at.desc()).all()

    def update_media(
        self,
        media_id: UUID,
        doctor_id: UUID,
        media_data: MediaUpdate
    ) -> Optional[Media]:
        """
        Update a media record.
        Args:
            media_id: ID of the media
            doctor_id: ID of the doctor
            media_data: Media update data
        Returns:
            Updated media if found and belongs to doctor, None otherwise
        """
        db_media = self.get_media_by_id(media_id, doctor_id)
        if not db_media:
            return None
        update_data = media_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_media, field, value)
        self.db.commit()
        self.db.refresh(db_media)
        logger.info("Updated media %s", media_id)
        return db_media

    def delete_media(self, media_id: UUID, doctor_id: UUID) -> bool:
        """
        Soft delete a media record.
        Args:
            media_id: ID of the media
            doctor_id: ID of the doctor
        Returns:
            True if media was deleted, False if not found
        """
        db_media = self.get_media_by_id(media_id, doctor_id)
        if not db_media:
            return False
        self.db.query(Media).filter(Media.id == media_id).update({"is_active": False})
        self.db.commit()
        logger.info("Soft deleted media %s", media_id)
        return True

    def get_media_file(self, media_id: UUID, doctor_id: UUID) -> Optional[tuple[bytes, str, str]]:
        """
        Get media file data.
        Args:
            media_id: ID of the media
            doctor_id: ID of the doctor
        Returns:
            tuple of (file_data, mime_type, filename) if found, None otherwise
        """
        db_media = self.get_media_by_id(media_id, doctor_id)
        if not db_media:
            return None
        try:
            file_data, mime_type = self.file_storage.read_file(str(db_media.file_path))
            return file_data, mime_type, str(db_media.filename)
        except Exception as e: # pylint: disable=broad-except
            logger.error("Failed to read file %s: %s", db_media.file_path, e)
            return None

    def get_media_file_chunked(self, media_id: UUID, doctor_id: UUID, chunk_size: int = 8192):
        """
        Get media file data as chunks for streaming.
        Args:
            media_id: ID of the media
            doctor_id: ID of the doctor
            chunk_size: Size of each chunk in bytes
        Yields:
            bytes: File chunks
        Returns:
            Generator of file chunks, or None if media not found
        """
        db_media = self.get_media_by_id(media_id, doctor_id)
        if not db_media:
            return None
        try:
            return self.file_storage.read_file_chunked(str(db_media.file_path), chunk_size)
        except Exception as e: # pylint: disable=broad-except
            logger.error("Failed to read file chunks %s: %s", db_media.file_path, e)
            return None

    def get_media_file_range(self, media_id: UUID, doctor_id: UUID, start: int, end: int) -> Optional[tuple[bytes, str, str, int]]:
        """
        Get a specific range of bytes from a media file.
        Args:
            media_id: ID of the media
            doctor_id: ID of the doctor
            start: Starting byte position (inclusive)
            end: Ending byte position (inclusive)
        Returns:
            tuple of (file_data, mime_type, filename, file_size) if found, None otherwise
        """
        db_media = self.get_media_by_id(media_id, doctor_id)
        if not db_media:
            return None
        try:
            file_data = self.file_storage.read_file_range(str(db_media.file_path), start, end)
            # Use stored mime type from database for consistency
            return file_data, cast(str, db_media.mime_type), str(db_media.filename), cast(int, db_media.file_size)
        except Exception as e: # pylint: disable=broad-except
            logger.error("Failed to read file range %s: %s", db_media.file_path, e)
            return None

    def get_media_info(self, media_id: UUID, doctor_id: UUID) -> Optional[tuple[str, str, int]]:
        """
        Get media file information without reading the file.
        Args:
            media_id: ID of the media
            doctor_id: ID of the doctor
        Returns:
            tuple of (mime_type, filename, file_size) if found, None otherwise
        """
        db_media = self.get_media_by_id(media_id, doctor_id)
        if not db_media:
            return None
        return cast(str, db_media.mime_type), str(db_media.filename), cast(int, db_media.file_size)

    def get_storage_info(self, doctor_id: UUID) -> dict:
        """
        Get storage usage information for a doctor.
        Args:
            doctor_id: ID of the doctor
        Returns:
            Dictionary with storage information
        """
        doctor_file_ids = self.get_doctor_file_ids(doctor_id)
        return self.file_storage.get_storage_info(doctor_file_ids)

    def count_media_by_study(self, study_id: UUID, doctor_id: UUID) -> int:
        """
        Count media files in a study.
        Args:
            study_id: ID of the study
            doctor_id: ID of the doctor
        Returns:
            Number of media files
        """
        if not self.check_study_ownership(study_id, doctor_id):
            return 0
        # pylint: disable=not-callable
        return self.db.query(func.count(Media.id)).filter(
            Media.study_id == study_id,
            Media.media_type.in_([MediaType.IMAGE, MediaType.VIDEO])  # Exclude frames
        ).scalar()

    def get_video_preview_frame(
        self, 
        media_id: UUID, 
        doctor_id: UUID,
        cache: Optional[RedisCache] = None
    ) -> Optional[bytes]:
        """
        Get a preview frame for a video at 0.5s timestamp.
        Uses Redis + filesystem caching for performance.
        
        Args:
            media_id: ID of the video media
            doctor_id: ID of the doctor (for access control)
            cache: Optional RedisCache instance for caching
        
        Returns:
            JPEG bytes of the preview frame, or None if extraction fails
        """
        # Check ownership and verify it's a video
        db_media = self.get_media_by_id(media_id, doctor_id)
        if not db_media or db_media.media_type.value != MediaType.VIDEO.value:
            logger.warning("Media %s not found or not a video", media_id)
            return None
        
        # Cache key for Redis
        redis_cache_key = f"video_preview:{media_id}"
        
        # Filesystem cache path
        preview_cache_dir = "media_storage/previews"
        os.makedirs(preview_cache_dir, exist_ok=True)
        preview_cache_path = os.path.join(preview_cache_dir, f"{media_id}.jpg")
        
        # 1. Try Redis cache first (fastest)
        if cache:
            try:
                cached_data = cache.get(redis_cache_key)
                if cached_data:
                    logger.debug("✅ Preview frame cache hit (Redis): %s", media_id)
                    return cached_data
            except Exception as e:
                logger.warning("Redis cache lookup failed: %s", e)
        
        # 2. Try filesystem cache (fallback)
        if os.path.exists(preview_cache_path):
            try:
                with open(preview_cache_path, 'rb') as f:
                    preview_data = f.read()
                logger.debug("✅ Preview frame cache hit (filesystem): %s", media_id)
                
                # Update Redis cache if available
                if cache:
                    try:
                        cache.set(redis_cache_key, preview_data, ttl=86400)  # 24 hours
                    except Exception as e:
                        logger.warning("Failed to update Redis cache: %s", e)
                
                return preview_data
            except Exception as e:
                logger.warning("Failed to read cached preview: %s", e)
        
        # 3. Extract new preview frame
        try:
            logger.debug("🎬 Extracting preview frame for video %s", media_id)
            
            # Get video file data
            file_data, _ = self.file_storage.read_file(str(db_media.file_path))
            
            # Create temporary files for processing
            with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as video_temp:
                video_temp.write(file_data)
                video_temp_path = video_temp.name
            
            frame_temp_path = tempfile.mktemp(suffix='.jpg')
            
            try:
                # Get video duration to ensure 0.5s is valid
                probe = ffmpeg.probe(video_temp_path)
                duration = float(probe['format']['duration'])
                
                # Use 0.5s if video is long enough, otherwise use 10% of duration
                timestamp = 0.5 if duration > 0.5 else max(0.1, duration * 0.1)
                
                logger.debug("Video duration: %.2fs, extracting at %.2fs", duration, timestamp)
                
                # Extract frame using ffmpeg
                stream = ffmpeg.input(video_temp_path, ss=timestamp)
                stream = ffmpeg.output(
                    stream,
                    frame_temp_path,
                    vframes=1,
                    format='mjpeg',
                    **{'q:v': '5'}  # Quality 5 for smaller file size
                )
                ffmpeg.run(stream, capture_stderr=True, overwrite_output=True, quiet=True)
                
                # Resize to thumbnail size (320x240 max) to reduce file size
                with PILImage.open(frame_temp_path) as img:
                    # Calculate dimensions maintaining aspect ratio
                    img.thumbnail((320, 240), PILImage.Resampling.LANCZOS)
                    
                    # Save optimized thumbnail
                    img.save(frame_temp_path, 'JPEG', quality=75, optimize=True)
                
                # Read the generated thumbnail
                with open(frame_temp_path, 'rb') as f:
                    preview_data = f.read()
                
                logger.info("✅ Preview frame extracted: %s (%.1f KB)", 
                           media_id, len(preview_data) / 1024)
                
                # Cache to filesystem
                try:
                    with open(preview_cache_path, 'wb') as f:
                        f.write(preview_data)
                except Exception as e:
                    logger.warning("Failed to cache preview to filesystem: %s", e)
                
                # Cache to Redis
                if cache:
                    try:
                        cache.set(redis_cache_key, preview_data, ttl=86400)  # 24 hours
                    except Exception as e:
                        logger.warning("Failed to cache preview to Redis: %s", e)
                
                return preview_data
                
            finally:
                # Cleanup temp files
                if os.path.exists(video_temp_path):
                    os.unlink(video_temp_path)
                if os.path.exists(frame_temp_path):
                    os.unlink(frame_temp_path)
                    
        except Exception as e:
            logger.error("Failed to extract preview frame for %s: %s", media_id, e)
            return None
