"""
Frame service for video frame extraction and management.
"""

import logging
import tempfile
import os
import uuid
from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from PIL import Image as PILImage
import ffmpeg

from app.models.media import Media, MediaType, UploadStatus
from app.models.frame import Frame
from app.schemas.frame import FrameCreate, VideoMetadata
from app.services.media_service import MediaService
from app.core.file_storage import FileStorageService

logger = logging.getLogger(__name__)


class FrameService:
    """Service class for frame extraction and management operations"""

    def __init__(self, db: Session):
        self.db = db
        self.media_service = MediaService(db)
        self.file_storage = FileStorageService()

    def get_video_metadata(self, video_media_id: UUID) -> Optional[VideoMetadata]:
        """Get video metadata using ffprobe"""
        try:
            video_media = self.db.query(Media).filter(Media.id == video_media_id).first()
            if not video_media or video_media.media_type.value != MediaType.VIDEO.value:
                return None

            # Get video file from storage
            try:
                file_data, _ = self.file_storage.read_file(str(video_media.file_path))
            except Exception:
                return None

            # Create temporary file for ffprobe
            with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as temp_file:
                temp_file.write(file_data)
                temp_file_path = temp_file.name

            try:
                # Use ffmpeg-python to get video metadata
                metadata = ffmpeg.probe(temp_file_path)
                
                # Find video stream
                video_stream = None
                for stream in metadata.get('streams', []):
                    if stream.get('codec_type') == 'video':
                        video_stream = stream
                        break
                
                if not video_stream:
                    return None

                duration = float(metadata.get('format', {}).get('duration', 0))
                width = int(video_stream.get('width', 0))
                height = int(video_stream.get('height', 0))
                fps = eval(video_stream.get('r_frame_rate', '0/1'))  # Convert fraction to float
                total_frames = int(duration * fps) if fps > 0 else 0

                return VideoMetadata(
                    duration_seconds=duration,
                    width=width,
                    height=height,
                    fps=fps,
                    total_frames=total_frames
                )

            finally:
                # Clean up temporary file
                os.unlink(temp_file_path)

        except Exception as e:
            logger.error(f"Error getting video metadata for {video_media_id}: {e}")
            return None

    def extract_frame_at_timestamp(
        self, 
        video_media_id: UUID, 
        timestamp_seconds: float,
        doctor_id: UUID
    ) -> Optional[Frame]:
        """Extract a frame from video at specified timestamp"""
        try:
            # Verify video exists and belongs to doctor
            video_media = self.db.query(Media).filter(Media.id == video_media_id).first()
            if not video_media or video_media.media_type.value != MediaType.VIDEO.value:
                logger.error(f"Video media not found: {video_media_id}")
                return None

            # Check ownership through study
            study_id = video_media.study_id
            if not self.media_service.check_study_ownership(study_id, doctor_id):
                logger.error(f"Access denied for video {video_media_id}")
                return None

            # Check if frame at this timestamp already exists
            existing_frame = self.db.query(Frame).filter(
                Frame.video_media_id == video_media_id,
                Frame.timestamp_seconds == timestamp_seconds,
                Frame.is_active
            ).first()
            
            if existing_frame:
                logger.info(f"Frame already exists at timestamp {timestamp_seconds} for video {video_media_id}")
                return existing_frame

            # Get video file from storage
            try:
                file_data, _ = self.file_storage.read_file(str(video_media.file_path))
            except Exception:
                logger.error(f"Video file not found in storage: {video_media.file_path}")
                return None

            # Create temporary files for video and frame
            with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as video_temp:
                video_temp.write(file_data)
                video_temp_path = video_temp.name

            frame_temp_path = tempfile.mktemp(suffix='.jpg')

            try:
                # Extract frame using ffmpeg
                # Use ffmpeg-python for frame extraction
                stream = ffmpeg.input(video_temp_path)
                stream = ffmpeg.filter(stream, 'select', f'gte(t,{timestamp_seconds})')
                stream = ffmpeg.output(stream, frame_temp_path, vframes=1, q=2)
                ffmpeg.run(stream, capture_stderr=True, overwrite_output=True)
                logger.info(f"FFmpeg extraction successful for video {video_media_id} at {timestamp_seconds}s")

                # Read extracted frame
                with open(frame_temp_path, 'rb') as frame_file:
                    frame_data = frame_file.read()

                # Get frame dimensions
                with PILImage.open(frame_temp_path) as img:
                    width, height = img.size

                # Generate unique filename for frame
                frame_filename = f"frame_{video_media_id}_{timestamp_seconds:.3f}s_{uuid.uuid4().hex[:8]}.jpg"
                
                # Store frame in file storage
                frame_file_info = self.file_storage.create_file(frame_data, frame_filename)
                frame_file_path = frame_file_info.file_id
                
                # Create media record for the frame
                frame_media_data = {
                    'study_id': video_media.study_id,
                    'filename': frame_filename,
                    'file_path': frame_file_path,
                    'file_size': len(frame_data),
                    'mime_type': 'image/jpeg',
                    'media_type': MediaType.FRAME,
                    'upload_status': UploadStatus.UPLOADED
                }
                
                frame_media = Media(**frame_media_data)
                self.db.add(frame_media)
                self.db.flush()  # Get the media ID

                # Calculate frame number (approximate based on existing frames)
                frame_count = self.db.query(Frame).filter(
                    Frame.video_media_id == video_media_id,
                    Frame.is_active
                ).count()
                frame_number = frame_count + 1

                # Create frame record
                frame_data = FrameCreate(
                    video_media_id=video_media_id,
                    frame_media_id=frame_media.id,
                    timestamp_seconds=timestamp_seconds,
                    frame_number=frame_number,
                    width=width,
                    height=height
                )
                
                frame = Frame(**frame_data.model_dump())
                self.db.add(frame)
                self.db.commit()
                
                logger.info(f"Successfully extracted frame {frame.id} from video {video_media_id} at {timestamp_seconds}s")
                return frame

            finally:
                # Clean up temporary files
                if os.path.exists(video_temp_path):
                    os.unlink(video_temp_path)
                if os.path.exists(frame_temp_path):
                    os.unlink(frame_temp_path)

        except ffmpeg.Error as e:
            logger.error(f"FFmpeg error extracting frame: {str(e)}")
            self.db.rollback()
            return None
        except Exception as e:
            logger.error(f"Error extracting frame from video {video_media_id}: {e}")
            self.db.rollback()
            return None

    def list_video_frames(self, video_media_id: UUID, doctor_id: UUID) -> List[Frame]:
        """List all frames for a video"""
        try:
            # Verify video exists and belongs to doctor
            video_media = self.db.query(Media).filter(Media.id == video_media_id).first()
            if not video_media or video_media.media_type.value != MediaType.VIDEO.value:
                return []

            # Check ownership
            if not self.media_service.check_study_ownership(video_media.study_id, doctor_id):
                return []

            # Get frames ordered by timestamp
            frames = self.db.query(Frame).filter(
                Frame.video_media_id == video_media_id,
                Frame.is_active
            ).order_by(Frame.timestamp_seconds.asc()).all()

            return frames

        except Exception as e:
            logger.error(f"Error listing frames for video {video_media_id}: {e}")
            return []

    def delete_frame(self, frame_id: UUID, doctor_id: UUID) -> bool:
        """Delete a frame and its associated media"""
        try:
            frame = self.db.query(Frame).filter(Frame.id == frame_id).first()
            if not frame:
                return False

            # Check ownership through video
            video_media = self.db.query(Media).filter(Media.id == frame.video_media_id).first()
            if not video_media or not self.media_service.check_study_ownership(video_media.study_id, doctor_id):
                return False

            # Get frame media for file deletion
            frame_media = self.db.query(Media).filter(Media.id == frame.frame_media_id).first()
            
            # Mark frame as inactive (soft delete) using update statement
            self.db.query(Frame).filter(Frame.id == frame_id).update({'is_active': False})
            
            # Also mark frame media as inactive and delete file
            if frame_media:
                self.db.query(Media).filter(Media.id == frame.frame_media_id).update({'is_active': False})
                # Delete file from storage
                self.file_storage.delete_file(str(frame_media.file_path))

            self.db.commit()
            logger.info(f"Successfully deleted frame {frame_id}")
            return True

        except Exception as e:
            logger.error(f"Error deleting frame {frame_id}: {e}")
            self.db.rollback()
            return False

    def get_frame(self, frame_id: UUID, doctor_id: UUID) -> Optional[Frame]:
        """Get a specific frame by ID"""
        try:
            frame = self.db.query(Frame).filter(
                Frame.id == frame_id,
                Frame.is_active
            ).first()
            
            if not frame:
                return None

            # Check ownership
            video_media = self.db.query(Media).filter(Media.id == frame.video_media_id).first()
            if not video_media or not self.media_service.check_study_ownership(video_media.study_id, doctor_id):
                return None

            return frame

        except Exception as e:
            logger.error(f"Error getting frame {frame_id}: {e}")
            return None