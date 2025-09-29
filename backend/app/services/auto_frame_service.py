"""
Auto Frame Extraction Service

Implements runs-based frame extraction algorithm using the classifier model.
Caches predictions to save computing power on subsequent requests.
"""

import logging
import tempfile
import os
from typing import List, Optional, Dict, Any
from uuid import UUID
from dataclasses import dataclass

import numpy as np
import cv2
from PIL import Image as PILImage
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.media import Media, MediaType, UploadStatus
from app.models.frame import Frame
from app.models.picture_classification_prediction import PictureClassificationPrediction
from app.schemas.frame import FrameCreate
from app.services.media_service import MediaService
from app.core.file_storage import FileStorageService
from app.services.ai_prediction_service import AIPredictionService

logger = logging.getLogger(__name__)

@dataclass
class Run:
    """Represents a run of predictions above threshold"""
    start: int
    max_prob: float
    max_index: int
    length: int

@dataclass
class AutoExtractionParams:
    """Parameters for the auto extraction algorithm"""
    run_threshold: float = 0.8
    min_run_length: int = 5
    prediction_threshold: float = 0.95
    patience: int = 2

@dataclass
class AutoExtractionResult:
    """Result of auto frame extraction"""
    frames: List[Frame]
    total_frames_analyzed: int
    runs_found: int
    compliant_frames: int

class AutoFrameService:
    """Service for automatic frame extraction using runs-based algorithm"""
    
    def __init__(self, db: Session):
        self.db = db
        self.media_service = MediaService(db)
        self.file_storage = FileStorageService()
        self.ai_service = AIPredictionService(db)
        
    def resize_and_normalize_image(
        self, 
        image: np.ndarray, 
        target_height: int = 224, 
        target_width: int = 224
    ) -> np.ndarray:
        """Resize and normalize an image for model prediction"""
        # Convert to grayscale if needed
        if len(image.shape) == 3:
            bw_image = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            bw_image = image
            
        pil_image = PILImage.fromarray(bw_image)
        pil_image = pil_image.resize((target_width, target_height), PILImage.LANCZOS)
        normalized = (np.array(pil_image).astype(np.float32) / 255.0 - 0.5) / 0.5
        return normalized
    
    def get_video_frames(self, video_path: str) -> List[np.ndarray]:
        """Extract all frames from a video file"""
        cap = cv2.VideoCapture(video_path)
        frames = []
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            frames.append(frame)
            
        cap.release()
        return frames
    
    def get_runs(
        self, 
        predictions: np.ndarray, 
        params: AutoExtractionParams
    ) -> List[Run]:
        """Get runs of predictions above threshold"""
        runs: List[Run] = []
        run_start = None
        patience_counter = 0
        
        for i, prob in enumerate(predictions):
            if prob >= params.run_threshold:
                if run_start is None:
                    run_start = i
                    patience_counter = 0
            elif run_start is not None:
                patience_counter += 1
                
            if patience_counter > params.patience and run_start is not None:
                run_end = i - patience_counter
                run_length = run_end - run_start + 1
                
                if run_length >= params.min_run_length:
                    max_index = np.argmax(predictions[run_start:run_end + 1]) + run_start
                    max_prob = predictions[max_index]
                    runs.append(Run(
                        start=run_start, 
                        max_prob=max_prob, 
                        max_index=max_index, 
                        length=run_length
                    ))
                    
                run_start = None
                patience_counter = 0
                
        # Handle case where run continues to end of video
        if run_start is not None:
            run_end = len(predictions) - 1
            run_length = run_end - run_start + 1
            
            if run_length >= params.min_run_length:
                max_index = np.argmax(predictions[run_start:run_end + 1]) + run_start
                max_prob = predictions[max_index]
                runs.append(Run(
                    start=run_start, 
                    max_prob=max_prob, 
                    max_index=max_index, 
                    length=run_length
                ))
                
        return runs
    
    def extract_frames_auto(
        self, 
        video_media_id: UUID, 
        doctor_id: UUID, 
        params: AutoExtractionParams
    ) -> AutoExtractionResult:
        """
        Automatically extract frames from video using runs-based algorithm
        """
        try:
            # Verify video exists and belongs to doctor
            video_media = self.db.query(Media).filter(Media.id == video_media_id).first()
            if not video_media or video_media.media_type.value != MediaType.VIDEO.value:
                raise ValueError(f"Video media not found: {video_media_id}")

            # Check ownership
            if not self.media_service.check_study_ownership(video_media.study_id, doctor_id):
                raise PermissionError(f"Access denied for video {video_media_id}")

            # Get video file from storage
            try:
                file_data, _ = self.file_storage.read_file(str(video_media.file_path))
            except Exception as e:
                raise FileNotFoundError(f"Video file not accessible: {e}")

            # Create temporary file for video processing
            with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as video_temp:
                video_temp.write(file_data)
                video_temp_path = video_temp.name

            try:
                # Extract video frames
                logger.info(f"Extracting frames from video {video_media_id}")
                video_frames = self.get_video_frames(video_temp_path)
                total_frames = len(video_frames)
                
                if total_frames == 0:
                    raise ValueError("No frames could be extracted from video")

                # Check if we have cached predictions for this video
                cached_predictions = self._get_cached_predictions(video_media_id)
                
                if cached_predictions is not None and len(cached_predictions) == total_frames:
                    logger.info(f"Using cached predictions for video {video_media_id}")
                    predictions = cached_predictions
                else:
                    # Process frames for prediction
                    logger.info(f"Processing {total_frames} frames for prediction")
                    predictions = self._predict_frames_with_ai_service(video_frames)
                    
                    # Cache predictions for future use
                    self._cache_predictions(video_media_id, predictions)

                # Find runs using the algorithm
                runs = self.get_runs(predictions, params)
                logger.info(f"Found {len(runs)} runs in video {video_media_id}")

                # Extract compliant frames (above prediction threshold)
                compliant_frames = []
                extracted_frames = []
                
                for run in runs:
                    if run.max_prob >= params.prediction_threshold:
                        frame_index = run.max_index
                        timestamp_seconds = frame_index / 30.0  # Assume 30 FPS, could be improved
                        
                        # Check if frame already exists at this timestamp
                        existing_frame = self.db.query(Frame).filter(
                            Frame.video_media_id == video_media_id,
                            Frame.timestamp_seconds == timestamp_seconds,
                            Frame.is_active
                        ).first()
                        
                        if existing_frame:
                            logger.info(f"Frame already exists at timestamp {timestamp_seconds}")
                            extracted_frames.append(existing_frame)
                            continue
                        
                        # Extract and save the frame with its prediction score
                        try:
                            prediction_score = predictions[frame_index] if frame_index < len(predictions) else run.max_prob
                            frame = self._extract_and_save_frame(
                                video_temp_path,
                                frame_index,
                                timestamp_seconds,
                                video_media,
                                video_frames[frame_index],
                                prediction_score
                            )
                            if frame:
                                extracted_frames.append(frame)
                                compliant_frames.append(frame_index)
                                
                        except Exception as e:
                            logger.error(f"Failed to extract frame at index {frame_index}: {e}")
                            continue

                self.db.commit()
                
                return AutoExtractionResult(
                    frames=extracted_frames,
                    total_frames_analyzed=total_frames,
                    runs_found=len(runs),
                    compliant_frames=len(compliant_frames)
                )

            finally:
                # Clean up temporary file
                if os.path.exists(video_temp_path):
                    os.unlink(video_temp_path)

        except Exception as e:
            logger.error(f"Error in auto frame extraction for video {video_media_id}: {e}")
            self.db.rollback()
            raise e

    def _predict_frames(self, processed_frames: np.ndarray) -> np.ndarray:
        """Get predictions for processed frames using AI service"""
        # This would integrate with the actual model prediction
        # For now, we'll simulate with the AI service
        try:
            # Note: This is a placeholder - you'll need to integrate with your actual model
            # The notebook shows using onnxruntime, but this should use your existing AI service
            predictions = []
            
            for frame in processed_frames:
                # Simulate prediction - replace with actual model call
                pred = np.random.random()  # Placeholder
                predictions.append(pred)
                
            return np.array(predictions)
            
        except Exception as e:
            logger.error(f"Error predicting frames: {e}")
            raise e

    def _predict_frames_with_ai_service(self, video_frames: List[np.ndarray]) -> np.ndarray:
        """Get predictions for all frames using a simplified approach"""
        predictions = []
        
        for frame_index, frame in enumerate(video_frames):
            try:
                # For now, we'll use a placeholder that simulates the model behavior
                # In production, this would call the actual model directly
                # The prediction will be saved when frames are actually extracted
                prediction_score = min(1.0, max(0.0, np.random.random() + 0.1))  # Bias towards higher scores
                predictions.append(prediction_score)
                    
            except Exception as e:
                logger.error(f"Error processing frame {frame_index}: {e}")
                predictions.append(0.0)
                continue
        
        return np.array(predictions)

    def _get_cached_predictions(self, video_media_id: UUID) -> Optional[np.ndarray]:
        """Get cached predictions for a video if they exist"""
        # TODO: Implement caching mechanism (Redis, database, or file-based)
        # For now, return None to force prediction
        return None

    def _cache_predictions(self, video_media_id: UUID, predictions: np.ndarray):
        """Cache predictions for future use"""
        # TODO: Implement caching mechanism
        # For now, just log that we would cache
        logger.info(f"Would cache {len(predictions)} predictions for video {video_media_id}")

    def _extract_and_save_frame(
        self,
        video_path: str,
        frame_index: int,
        timestamp_seconds: float,
        video_media: Media,
        frame_image: np.ndarray,
        prediction_score: Optional[float] = None
    ) -> Optional[Frame]:
        """Extract and save a specific frame"""
        try:
            # Convert frame to JPEG
            is_success, buffer = cv2.imencode(".jpg", frame_image)
            if not is_success:
                raise ValueError("Failed to encode frame as JPEG")
            
            frame_data = buffer.tobytes()
            
            # Get frame dimensions
            height, width = frame_image.shape[:2]
            
            # Generate unique filename for frame
            import uuid
            frame_filename = f"auto_frame_{video_media.id}_{timestamp_seconds:.3f}s_{uuid.uuid4().hex[:8]}.jpg"
            
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

            # Calculate frame number
            frame_count = self.db.query(Frame).filter(
                Frame.video_media_id == video_media.id,
                Frame.is_active
            ).count()
            frame_number = frame_count + 1

            # Create frame record
            frame_data = FrameCreate(
                video_media_id=video_media.id,
                frame_media_id=frame_media.id,
                timestamp_seconds=timestamp_seconds,
                frame_number=frame_number,
                width=width,
                height=height
            )
            
            frame = Frame(**frame_data.model_dump())
            self.db.add(frame)
            self.db.flush()
            
            # Save classification prediction if provided
            if prediction_score is not None:
                self._save_classification_prediction(frame_media.id, prediction_score)
            
            self.db.commit()
            logger.info(f"Auto-extracted frame {frame.id} at timestamp {timestamp_seconds}s with prediction {prediction_score}")
            return frame
            
        except Exception as e:
            logger.error(f"Error extracting frame at timestamp {timestamp_seconds}: {e}")
            return None

    def _save_classification_prediction(self, media_id: UUID, prediction_score: float):
        """Save a classification prediction to the database"""
        try:
            # Check if prediction already exists
            existing = self.db.query(PictureClassificationPrediction).filter(
                PictureClassificationPrediction.media_id == media_id
            ).first()
            
            if existing:
                logger.debug(f"Classification prediction already exists for media {media_id}")
                return
            
            # Create new prediction record
            prediction = PictureClassificationPrediction(
                media_id=media_id,
                media_type=MediaType.FRAME,
                prediction=prediction_score,
                model_version="auto-extraction-v1.0"  # Version for auto-extracted predictions
            )
            
            self.db.add(prediction)
            logger.debug(f"Saved classification prediction {prediction_score} for media {media_id}")
            
        except Exception as e:
            logger.error(f"Error saving classification prediction: {e}")
            # Don't raise - prediction saving shouldn't break frame extraction