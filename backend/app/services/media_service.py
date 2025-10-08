"""
Media service for business logic operations.
"""


import logging
from typing import List, Optional, Tuple
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.media import Media, MediaType, UploadStatus
from app.models.study import Study
from app.schemas.media import MediaCreate, MediaUpdate
from app.core.file_storage import FileStorageService, FileInfo


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

    def get_doctor_file_ids(self, doctor_id: UUID) -> List[str]:
        """
        Get all file IDs for a doctor's active media.
        Args:
            doctor_id: ID of the doctor
        Returns:
            List of file IDs
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

    def get_media_by_study(self, study_id: UUID, doctor_id: UUID) -> List[Media]:
        """
        Get all media for a study, ensuring study belongs to doctor.
        Args:
            study_id: ID of the study
            doctor_id: ID of the doctor
        Returns:
            List of media objects
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

    def get_media_file(self, media_id: UUID, doctor_id: UUID) -> Optional[Tuple[bytes, str, str]]:
        """
        Get media file data.
        Args:
            media_id: ID of the media
            doctor_id: ID of the doctor
        Returns:
            Tuple of (file_data, mime_type, filename) if found, None otherwise
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

    def get_media_file_range(self, media_id: UUID, doctor_id: UUID, start: int, end: int) -> Optional[Tuple[bytes, str, str, int]]:
        """
        Get a specific range of bytes from a media file.
        Args:
            media_id: ID of the media
            doctor_id: ID of the doctor
            start: Starting byte position (inclusive)
            end: Ending byte position (inclusive)
        Returns:
            Tuple of (file_data, mime_type, filename, file_size) if found, None otherwise
        """
        db_media = self.get_media_by_id(media_id, doctor_id)
        if not db_media:
            return None
        try:
            file_data = self.file_storage.read_file_range(str(db_media.file_path), start, end)
            # Use stored mime type from database for consistency
            return file_data, db_media.mime_type, str(db_media.filename), db_media.file_size
        except Exception as e: # pylint: disable=broad-except
            logger.error("Failed to read file range %s: %s", db_media.file_path, e)
            return None

    def get_media_info(self, media_id: UUID, doctor_id: UUID) -> Optional[Tuple[str, str, int]]:
        """
        Get media file information without reading the file.
        Args:
            media_id: ID of the media
            doctor_id: ID of the doctor
        Returns:
            Tuple of (mime_type, filename, file_size) if found, None otherwise
        """
        db_media = self.get_media_by_id(media_id, doctor_id)
        if not db_media:
            return None
        return db_media.mime_type, str(db_media.filename), db_media.file_size

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
