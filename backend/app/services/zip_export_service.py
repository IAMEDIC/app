"""
ZIP export service for downloading annotation data with associated media files.
"""

import io
import logging
import zipfile
from datetime import datetime
from typing import Generator

from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.models.picture_classification_annotation import PictureClassificationAnnotation
from app.models.picture_bb_annotation import PictureBBAnnotation
from app.models.media import Media
from app.models.study import Study
from app.schemas.csv_export import CSVExportRequest, CSVExportInfo
from app.services.csv_export_service import CSVExportService
from app.core.file_storage import FileStorageService


logger = logging.getLogger(__name__)


class ZipExportService:
    """Service class for exporting annotations and media files as ZIP archives"""

    def __init__(self, db: Session, file_storage: FileStorageService | None = None):
        self.db = db
        self.file_storage = file_storage or FileStorageService()
        self.csv_service = CSVExportService(db)

    def export_classification_annotations_with_media(self, request: CSVExportRequest) -> tuple[Generator[bytes, None, None], CSVExportInfo]:
        """Export classification annotations with associated media files as ZIP"""
        logger.debug(f"📦 Creating ZIP export for classification annotations from {request.start_date} to {request.end_date}")

        # Get annotations and media info
        media_files = self._get_classification_media_files(request)
        
        # Generate filename and export info
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"classification_annotations_with_media_{request.start_date}_{request.end_date}_{timestamp}.zip"
        
        export_info = CSVExportInfo(
            export_type="classification_with_media",
            date_range={"start_date": str(request.start_date), "end_date": str(request.end_date)},
            total_records=len(media_files),
            included_soft_deleted=request.include_soft_deleted or False,
            included_hidden_annotations=None,
            filename=filename
        )

        # Generate ZIP content
        zip_generator = self._generate_classification_zip(request, media_files)

        logger.debug(f"📦 Classification ZIP export prepared: {len(media_files)} media files, filename: {filename}")
        return zip_generator, export_info

    def export_bounding_box_annotations_with_media(self, request: CSVExportRequest) -> tuple[Generator[bytes, None, None], CSVExportInfo]:
        """Export bounding box annotations with associated media files as ZIP"""
        logger.debug(f"📦 Creating ZIP export for bounding box annotations from {request.start_date} to {request.end_date}")

        # Get annotations and media info
        media_files = self._get_bounding_box_media_files(request)
        
        # Generate filename and export info
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"bounding_box_annotations_with_media_{request.start_date}_{request.end_date}_{timestamp}.zip"
        
        export_info = CSVExportInfo(
            export_type="bounding_box_with_media",
            date_range={"start_date": str(request.start_date), "end_date": str(request.end_date)},
            total_records=len(media_files),
            included_soft_deleted=request.include_soft_deleted or False,
            included_hidden_annotations=request.include_hidden_annotations or False,
            filename=filename
        )

        # Generate ZIP content
        zip_generator = self._generate_bounding_box_zip(request, media_files)

        logger.debug(f"📦 Bounding box ZIP export prepared: {len(media_files)} media files, filename: {filename}")
        return zip_generator, export_info

    def _get_classification_media_files(self, request: CSVExportRequest) -> list:
        """Get unique media files associated with classification annotations"""
        query = self.db.query(
            Media.file_path,
            Media.filename,
            Media.mime_type
        ).join(
            PictureClassificationAnnotation,
            PictureClassificationAnnotation.media_id == Media.id
        ).join(
            Study,
            Media.study_id == Study.id
        ).filter(
            and_(
                PictureClassificationAnnotation.created_at >= request.start_date,
                PictureClassificationAnnotation.created_at <= request.end_date
            )
        )

        # Apply soft deletion filters
        if not request.include_soft_deleted:
            query = query.filter(
                and_(
                    Media.is_active.is_(True),
                    Study.is_active.is_(True)
                )
            )

        # Get distinct media files
        results = query.distinct().all()
        return results

    def _get_bounding_box_media_files(self, request: CSVExportRequest) -> list:
        """Get unique media files associated with bounding box annotations"""
        query = self.db.query(
            Media.file_path,
            Media.filename,
            Media.mime_type
        ).join(
            PictureBBAnnotation,
            PictureBBAnnotation.media_id == Media.id
        ).join(
            Study,
            Media.study_id == Study.id
        ).filter(
            and_(
                PictureBBAnnotation.created_at >= request.start_date,
                PictureBBAnnotation.created_at <= request.end_date
            )
        )

        # Apply soft deletion filters
        if not request.include_soft_deleted:
            query = query.filter(
                and_(
                    Media.is_active.is_(True),
                    Study.is_active.is_(True)
                )
            )

        # Apply hidden annotation filters
        if not request.include_hidden_annotations:
            query = query.filter(
                PictureBBAnnotation.is_hidden.is_(False)
            )

        # Get distinct media files
        results = query.distinct().all()
        return results

    def _generate_classification_zip(self, request: CSVExportRequest, media_files: list) -> Generator[bytes, None, None]:
        """Generate ZIP file with classification CSV and media files"""
        # Create in-memory ZIP buffer
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # Add CSV file to ZIP
            csv_generator, _ = self.csv_service.export_classification_annotations(request)
            csv_content = ''.join(csv_generator)
            zip_file.writestr('annotations.csv', csv_content)

            # Add media files to ZIP
            for file_path, original_filename, mime_type in media_files:
                try:
                    # Read file data from storage
                    file_data, _ = self.file_storage.read_file(str(file_path))
                    
                    # Create proper filename using our helper
                    zip_filename = self._create_zip_filename(str(file_path), str(mime_type), str(original_filename))
                    
                    # Add to ZIP in media/ subdirectory
                    zip_file.writestr(f'media/{zip_filename}', file_data)
                    
                except Exception as e:
                    logger.warning(f"⚠️ Failed to add media file {file_path} to ZIP: {e}")
                    # Continue with other files, don't break the entire export

        # Return ZIP content
        zip_buffer.seek(0)
        zip_content = zip_buffer.getvalue()
        zip_buffer.close()
        
        # Yield the entire ZIP file
        yield zip_content

    def _generate_bounding_box_zip(self, request: CSVExportRequest, media_files: list) -> Generator[bytes, None, None]:
        """Generate ZIP file with bounding box CSV and media files"""
        # Create in-memory ZIP buffer
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # Add CSV file to ZIP
            csv_generator, _ = self.csv_service.export_bounding_box_annotations(request)
            csv_content = ''.join(csv_generator)
            zip_file.writestr('annotations.csv', csv_content)

            # Add media files to ZIP
            for file_path, original_filename, mime_type in media_files:
                try:
                    # Read file data from storage
                    file_data, _ = self.file_storage.read_file(str(file_path))
                    
                    # Create proper filename using our helper
                    zip_filename = self._create_zip_filename(str(file_path), str(mime_type), str(original_filename))
                    
                    # Add to ZIP in media/ subdirectory
                    zip_file.writestr(f'media/{zip_filename}', file_data)
                    
                except Exception as e:
                    logger.warning(f"⚠️ Failed to add media file {file_path} to ZIP: {e}")
                    # Continue with other files, don't break the entire export

        # Return ZIP content
        zip_buffer.seek(0)
        zip_content = zip_buffer.getvalue()
        zip_buffer.close()
        
        # Yield the entire ZIP file
        yield zip_content

    def _create_zip_filename(self, file_path: str, mime_type: str, original_filename: str) -> str:
        """Create a filename for ZIP export using file_path (storage ID) and proper extension"""
        # Map MIME types to file extensions
        mime_to_extension = {
            'image/jpeg': '.jpg',
            'image/jpg': '.jpg', 
            'image/png': '.png',
            'image/gif': '.gif',
            'image/bmp': '.bmp',
            'image/tiff': '.tiff',
            'image/webp': '.webp',
            'video/mp4': '.mp4',
            'video/avi': '.avi',
            'video/quicktime': '.mov',
            'video/webm': '.webm',
            'video/x-msvideo': '.avi'
        }
        
        # Get the extension from mime_type, fallback to original filename extension
        extension = mime_to_extension.get(mime_type.lower())
        if not extension:
            # Extract extension from original filename as fallback
            import os
            extension = os.path.splitext(original_filename)[1] or '.bin'
        
        # Use file_path (which is the storage ID/anonymized name) + proper extension
        return f"{file_path}{extension}"