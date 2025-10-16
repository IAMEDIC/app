"""
CSV export service for downloading annotation data.
"""

import csv
import io
import logging
from datetime import datetime
from typing import Generator

from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.models.picture_classification_annotation import PictureClassificationAnnotation
from app.models.picture_bb_annotation import PictureBBAnnotation
from app.models.media import Media
from app.models.study import Study
from app.schemas.csv_export import CSVExportRequest, CSVExportInfo


logger = logging.getLogger(__name__)


class CSVExportService:
    """Service class for exporting annotations to CSV format"""

    def __init__(self, db: Session):
        self.db = db

    def export_classification_annotations(self, request: CSVExportRequest) -> tuple[Generator[str, None, None], CSVExportInfo]:
        """Export classification annotations to CSV format"""
        logger.debug(f"📊 Exporting classification annotations from {request.start_date} to {request.end_date}, "
                    f"include_soft_deleted={request.include_soft_deleted}")

        # Build query for classification annotations
        query = self.db.query(
            PictureClassificationAnnotation,
            Media.filename,
            Media.mime_type,
            Media.file_path
        ).join(
            Media, 
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

        # Apply soft deletion filters if not including soft deleted records
        if not request.include_soft_deleted:
            query = query.filter(
                and_(
                    Media.is_active.is_(True),
                    Study.is_active.is_(True)
                )
            )

        # Order by creation date for consistent output
        query = query.order_by(PictureClassificationAnnotation.created_at)

        # Get results and count
        results = query.all()
        total_records = len(results)

        # Generate filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"classification_annotations_{request.start_date}_{request.end_date}_{timestamp}.csv"

        # Create export info
        export_info = CSVExportInfo(
            export_type="classification",
            date_range={"start_date": str(request.start_date), "end_date": str(request.end_date)},
            total_records=total_records,
            included_soft_deleted=request.include_soft_deleted or False,
            included_hidden_annotations=None,  # Not applicable for classification
            filename=filename
        )

        # Generate CSV content
        csv_generator = self._generate_classification_csv(results)

        logger.debug(f"📊 Classification export prepared: {total_records} records, filename: {filename}")
        return csv_generator, export_info

    def export_bounding_box_annotations(self, request: CSVExportRequest) -> tuple[Generator[str, None, None], CSVExportInfo]:
        """Export bounding box annotations to CSV format"""
        logger.debug(f"📊 Exporting bounding box annotations from {request.start_date} to {request.end_date}, "
                    f"include_soft_deleted={request.include_soft_deleted}, include_hidden={request.include_hidden_annotations}")

        # Build query for bounding box annotations
        query = self.db.query(
            PictureBBAnnotation,
            Media.filename,
            Media.mime_type,
            Media.file_path
        ).join(
            Media, 
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

        # Apply soft deletion filters if not including soft deleted records
        if not request.include_soft_deleted:
            query = query.filter(
                and_(
                    Media.is_active.is_(True),
                    Study.is_active.is_(True)
                )
            )

        # Exclude hidden annotations unless specifically requested
        if not request.include_hidden_annotations:
            query = query.filter(
                PictureBBAnnotation.is_hidden.is_(False)
            )

        # Order by creation date for consistent output
        query = query.order_by(PictureBBAnnotation.created_at)

        # Get results and count
        results = query.all()
        total_records = len(results)

        # Generate filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"bounding_box_annotations_{request.start_date}_{request.end_date}_{timestamp}.csv"

        # Create export info
        export_info = CSVExportInfo(
            export_type="bounding_box",
            date_range={"start_date": str(request.start_date), "end_date": str(request.end_date)},
            total_records=total_records,
            included_soft_deleted=request.include_soft_deleted or False,
            included_hidden_annotations=request.include_hidden_annotations or False,
            filename=filename
        )

        # Generate CSV content
        csv_generator = self._generate_bounding_box_csv(results)

        logger.debug(f"📊 Bounding box export prepared: {total_records} records, filename: {filename}")
        return csv_generator, export_info

    def _generate_classification_csv(self, results) -> Generator[str, None, None]:
        """Generate CSV content for classification annotations"""
        # Create string buffer for CSV writing
        output = io.StringIO()
        writer = csv.writer(output)

        # Write header
        header = ["filename", "media_type", "usefulness", "annotation_date"]
        writer.writerow(header)
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)

        # Write data rows
        for annotation, original_filename, mime_type, file_path in results:
            # Create a proper filename using file_path (storage ID) and mime_type extension
            csv_filename = self._create_csv_filename(str(file_path), str(mime_type), str(original_filename))
            
            row = [
                csv_filename,
                str(annotation.media_type.value),  # type: ignore
                int(annotation.usefulness),  # type: ignore
                annotation.created_at.strftime("%Y-%m-%d %H:%M:%S")  # type: ignore
            ]
            writer.writerow(row)
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

    def _generate_bounding_box_csv(self, results) -> Generator[str, None, None]:
        """Generate CSV content for bounding box annotations"""
        # Create string buffer for CSV writing
        output = io.StringIO()
        writer = csv.writer(output)

        # Write header
        header = ["filename", "media_type", "bb_class", "xmin", "ymin", "width", "height", "annotation_date"]
        writer.writerow(header)
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)

        # Write data rows
        for annotation, original_filename, mime_type, file_path in results:
            # Create a proper filename using file_path (storage ID) and mime_type extension
            csv_filename = self._create_csv_filename(str(file_path), str(mime_type), str(original_filename))
            
            row = [
                csv_filename,
                str(annotation.media_type.value),  # type: ignore
                str(annotation.bb_class),  # type: ignore
                float(annotation.x_min),  # type: ignore - Use original pixel coordinates
                float(annotation.y_min),  # type: ignore
                float(annotation.width),  # type: ignore
                float(annotation.height),  # type: ignore
                annotation.created_at.strftime("%Y-%m-%d %H:%M:%S")  # type: ignore
            ]
            writer.writerow(row)
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

    def _create_csv_filename(self, file_path: str, mime_type: str, original_filename: str) -> str:
        """Create a filename for CSV export using file_path (storage ID) and proper extension"""
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