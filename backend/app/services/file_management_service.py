"""
File management service for storage statistics and hard delete operations.
"""

import logging
import time
from typing import cast
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from app.models.study import Study
from app.models.media import Media
from app.models.picture_classification_annotation import PictureClassificationAnnotation
from app.models.picture_classification_prediction import PictureClassificationPrediction
from app.models.picture_bb_annotation import PictureBBAnnotation
from app.models.picture_bb_prediction import PictureBBPrediction
from app.models.frame import Frame
from app.schemas.file_management import FileManagementStats, HardDeleteSummary
from app.core.file_storage import FileStorageService

logger = logging.getLogger(__name__)


class FileManagementService:
    """Service class for file management operations"""

    def __init__(self, db: Session):
        self.db = db
        self.file_storage = FileStorageService()

    def get_storage_statistics(self) -> FileManagementStats:
        """
        Calculate system-wide storage statistics including active and soft-deleted files.
        
        Returns:
            FileManagementStats: Complete statistics about file storage usage
        """
        logger.debug("📊 Calculating system-wide storage statistics")

        # Get counts and storage for active files
        active_count = self.db.query(func.count(Media.id)).filter(Media.is_active.is_(True)).scalar() or 0
        active_bytes = self.db.query(func.coalesce(func.sum(Media.file_size), 0)).filter(Media.is_active.is_(True)).scalar() or 0

        # Get counts and storage for soft-deleted files
        soft_deleted_count = self.db.query(func.count(Media.id)).filter(Media.is_active.is_(False)).scalar() or 0
        soft_deleted_bytes = self.db.query(func.coalesce(func.sum(Media.file_size), 0)).filter(Media.is_active.is_(False)).scalar() or 0

        # Ensure values are integers
        active_count = int(active_count)
        active_bytes = int(active_bytes)
        soft_deleted_count = int(soft_deleted_count)
        soft_deleted_bytes = int(soft_deleted_bytes)

        # Calculate totals
        total_count = active_count + soft_deleted_count
        total_bytes = active_bytes + soft_deleted_bytes

        # Calculate percentages (avoid division by zero)
        if total_count > 0:
            active_files_percentage = (active_count / total_count) * 100
            soft_deleted_files_percentage = (soft_deleted_count / total_count) * 100
        else:
            active_files_percentage = 0.0
            soft_deleted_files_percentage = 0.0

        if total_bytes > 0:
            active_storage_percentage = (active_bytes / total_bytes) * 100
            soft_deleted_storage_percentage = (soft_deleted_bytes / total_bytes) * 100
        else:
            active_storage_percentage = 0.0
            soft_deleted_storage_percentage = 0.0

        # Convert bytes to MB
        total_mb = total_bytes / (1024 * 1024)
        active_mb = active_bytes / (1024 * 1024)
        soft_deleted_mb = soft_deleted_bytes / (1024 * 1024)

        stats = FileManagementStats(
            total_storage_bytes=total_bytes,
            total_storage_mb=round(total_mb, 2),
            active_files_count=active_count,
            soft_deleted_files_count=soft_deleted_count,
            active_files_bytes=active_bytes,
            soft_deleted_files_bytes=soft_deleted_bytes,
            active_files_mb=round(active_mb, 2),
            soft_deleted_files_mb=round(soft_deleted_mb, 2),
            active_files_percentage=round(active_files_percentage, 1),
            soft_deleted_files_percentage=round(soft_deleted_files_percentage, 1),
            active_storage_percentage=round(active_storage_percentage, 1),
            soft_deleted_storage_percentage=round(soft_deleted_storage_percentage, 1)
        )

        logger.debug(
            "📊 Storage statistics calculated: %d total files (%.1fMB), "
            "%d active (%.1fMB), %d soft-deleted (%.1fMB)",
            total_count, total_mb, active_count, active_mb, soft_deleted_count, soft_deleted_mb
        )

        return stats

    def get_soft_deleted_items(self) -> dict:
        """
        Get counts of all soft-deleted items that would be affected by hard delete.
        
        Returns:
            dict: Contains counts of soft-deleted studies, media, and associated data
        """
        logger.debug("🔍 Analyzing soft-deleted items for cleanup")

        # Count soft-deleted studies
        soft_deleted_studies = self.db.query(func.count(Study.id)).filter(
            Study.is_active.is_(False)
        ).scalar() or 0

        # Count soft-deleted media (including those belonging to soft-deleted studies)
        soft_deleted_media = self.db.query(func.count(Media.id)).filter(
            Media.is_active.is_(False)
        ).scalar() or 0

        # Count media belonging to soft-deleted studies (these will be cascade deleted)
        media_in_deleted_studies = self.db.query(func.count(Media.id)).join(
            Study, Media.study_id == Study.id
        ).filter(Study.is_active.is_(False)).scalar() or 0

        # Count annotations and predictions that would be deleted
        # (these are cascade deleted when media is deleted)
        classification_annotations = self.db.query(func.count(PictureClassificationAnnotation.id)).join(
            Media, PictureClassificationAnnotation.media_id == Media.id
        ).filter(
            and_(
                Media.is_active.is_(False)
            )
        ).scalar() or 0

        classification_predictions = self.db.query(func.count(PictureClassificationPrediction.id)).join(
            Media, PictureClassificationPrediction.media_id == Media.id
        ).filter(
            and_(
                Media.is_active.is_(False)
            )
        ).scalar() or 0

        bb_annotations = self.db.query(func.count(PictureBBAnnotation.id)).join(
            Media, PictureBBAnnotation.media_id == Media.id
        ).filter(
            and_(
                Media.is_active.is_(False)
            )
        ).scalar() or 0

        bb_predictions = self.db.query(func.count(PictureBBPrediction.id)).join(
            Media, PictureBBPrediction.media_id == Media.id
        ).filter(
            and_(
                Media.is_active.is_(False)
            )
        ).scalar() or 0

        frames = self.db.query(func.count(Frame.id)).join(
            Media, Frame.video_media_id == Media.id
        ).filter(
            and_(
                Media.is_active.is_(False)
            )
        ).scalar() or 0

        result = {
            "soft_deleted_studies": soft_deleted_studies,
            "soft_deleted_media": soft_deleted_media,
            "media_in_deleted_studies": media_in_deleted_studies,
            "total_media_to_delete": soft_deleted_media + media_in_deleted_studies,
            "classification_annotations": classification_annotations,
            "classification_predictions": classification_predictions,
            "bb_annotations": bb_annotations,
            "bb_predictions": bb_predictions,
            "frames": frames
        }

        logger.debug(
            "🔍 Soft-deleted items analysis: %d studies, %d media, "
            "%d annotations/predictions total",
            soft_deleted_studies, soft_deleted_media + media_in_deleted_studies,
            classification_annotations + classification_predictions + bb_annotations + bb_predictions
        )

        return result

    def _get_soft_deleted_media_file_paths(self) -> list[tuple[str, int]]:
        """
        Get file paths and sizes of all media that will be hard deleted.
        
        Returns:
            list[tuple[str, int]]: list of (file_path, file_size) tuples
        """
        # Get soft-deleted media files
        soft_deleted_media = self.db.query(Media.file_path, Media.file_size).filter(
            Media.is_active.is_(False)
        ).all()

        # Get media files from soft-deleted studies
        media_from_deleted_studies = self.db.query(Media.file_path, Media.file_size).join(
            Study, Media.study_id == Study.id
        ).filter(Study.is_active.is_(False)).all()

        # Combine and deduplicate based on file_path
        all_files = {}
        for file_path, file_size in soft_deleted_media + media_from_deleted_studies:
            if file_path not in all_files:
                all_files[file_path] = file_size

        return list(all_files.items())

    def validate_hard_delete_request(self, confirmation_text: str) -> bool:
        """
        Validate that the confirmation text is exactly 'DELETE'.
        
        Args:
            confirmation_text: Text provided by user for confirmation
            
        Returns:
            bool: True if confirmation is valid, False otherwise
        """
        return confirmation_text == "DELETE"

    def hard_delete_soft_deleted_items(self, progress_callback=None) -> HardDeleteSummary:
        """
        Permanently delete all soft-deleted studies and media.
        
        This method:
        1. Deletes all soft-deleted studies (cascade deletes associated media)
        2. Deletes remaining soft-deleted media records  
        3. Removes physical files from disk
        4. Provides progress updates via callback
        
        Args:
            progress_callback: Optional function to call with progress updates
            
        Returns:
            HardDeleteSummary: Summary of the deletion operation
        """
        start_time = time.time()
        errors = []
        deleted_studies_count = 0
        deleted_media_count = 0
        deleted_files_count = 0
        freed_storage_bytes = 0  # Initialize as plain int

        def update_progress(message: str, processed: int, total: int):
            if progress_callback:
                progress_callback({
                    "status": "running",
                    "progress": processed / total if total > 0 else 0,
                    "processed_items": processed,
                    "total_items": total,
                    "current_operation": message,
                    "errors": errors
                })

        try:
            logger.info("🗑️ Starting hard delete operation for all soft-deleted items")

            # Step 1: Get all items to be deleted for progress tracking
            analysis = self.get_soft_deleted_items()
            total_operations = (
                analysis["soft_deleted_studies"] + 
                analysis["soft_deleted_media"] + 
                analysis["media_in_deleted_studies"]
            )
            
            if total_operations == 0:
                logger.info("✅ No soft-deleted items found to delete")
                return HardDeleteSummary(
                    deleted_studies_count=0,
                    deleted_media_count=0,
                    deleted_files_count=0,
                    freed_storage_bytes=0,
                    freed_storage_mb=0.0,
                    total_errors=0,
                    operation_duration_seconds=time.time() - start_time
                )

            processed_count = 0
            
            # Step 2: Delete soft-deleted studies (CASCADE deletes associated media/annotations)
            update_progress("Deleting soft-deleted studies...", processed_count, total_operations)
            
            soft_deleted_studies = self.db.query(Study).filter(Study.is_active.is_(False)).all()
            for study in soft_deleted_studies:
                try:
                    # Get media files from this study before deletion
                    study_media_files = self.db.query(Media.file_path, Media.file_size).filter(
                        Media.study_id == study.id
                    ).all()
                    
                    # Delete the study (CASCADE will handle media/annotations/predictions)
                    self.db.delete(study)
                    deleted_studies_count += 1
                    deleted_media_count += len(study_media_files)
                    
                    # Delete physical files
                    for file_path, file_size in study_media_files:
                        try:
                            if self.file_storage.delete_file(str(file_path)):
                                deleted_files_count += 1
                                freed_storage_bytes += int(file_size) if file_size else 0
                        except Exception as e:
                            errors.append(f"Failed to delete file {file_path}: {str(e)}")
                    
                    processed_count += 1
                    update_progress(f"Deleted study {study.alias}", processed_count, total_operations)
                    
                except Exception as e:
                    errors.append(f"Failed to delete study {study.alias}: {str(e)}")
                    
            # Step 3: Delete remaining soft-deleted media records
            update_progress("Deleting remaining soft-deleted media...", processed_count, total_operations)
            
            remaining_soft_deleted_media = self.db.query(Media).filter(Media.is_active.is_(False)).all()
            for media in remaining_soft_deleted_media:
                try:
                    # Delete physical file
                    try:
                        if self.file_storage.delete_file(str(media.file_path)):
                            deleted_files_count += 1
                            freed_storage_bytes += media.file_size
                    except Exception as e:
                        errors.append(f"Failed to delete file {media.file_path}: {str(e)}")
                    
                    # Delete media record (CASCADE handles annotations/predictions)
                    self.db.delete(media)
                    deleted_media_count += 1
                    processed_count += 1
                    update_progress(f"Deleted media {media.filename}", processed_count, total_operations)
                    
                except Exception as e:
                    errors.append(f"Failed to delete media {media.filename}: {str(e)}")

            # Commit all database changes
            self.db.commit()
            
            operation_duration = time.time() - start_time
            freed_storage_mb = freed_storage_bytes / (1024 * 1024)
            
            logger.info(
                "✅ Hard delete operation completed: %d studies, %d media, %d files deleted, "
                "%.2f MB freed, %d errors in %.2f seconds",
                deleted_studies_count, deleted_media_count, deleted_files_count,
                freed_storage_mb, len(errors), operation_duration
            )
            
            # Final progress update
            if progress_callback:
                progress_callback({
                    "status": "completed",
                    "progress": 1.0,
                    "processed_items": total_operations,
                    "total_items": total_operations,
                    "current_operation": "Hard delete operation completed",
                    "errors": errors
                })
            
            return HardDeleteSummary(
                deleted_studies_count=deleted_studies_count,
                deleted_media_count=deleted_media_count,
                deleted_files_count=deleted_files_count,
                freed_storage_bytes=cast(int, freed_storage_bytes),
                freed_storage_mb=cast(int, freed_storage_mb),
                total_errors=len(errors),
                operation_duration_seconds=operation_duration
            )
            
        except Exception as e:
            self.db.rollback()
            error_msg = f"Hard delete operation failed: {str(e)}"
            logger.error("❌ %s", error_msg)
            errors.append(error_msg)
            
            if progress_callback:
                progress_callback({
                    "status": "failed",
                    "progress": 0.0,
                    "processed_items": processed_count,
                    "total_items": total_operations,
                    "current_operation": f"Operation failed: {str(e)}",
                    "errors": errors
                })
            
            raise ValueError(error_msg) from e