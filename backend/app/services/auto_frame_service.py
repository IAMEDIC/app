"""
Auto Frame Extraction Service

Implements runs-based frame extraction algorithm using the classifier model.
Caches predictions to save computing power on subsequent requests.
"""


import logging
import tempfile
import os
import base64
import asyncio
from uuid import UUID
from dataclasses import dataclass
from typing import cast

import numpy as np
import cv2
import httpx
from sqlalchemy.orm import Session

from app.models.media import Media, MediaType
from app.models.frame import Frame
from app.services.media_service import MediaService
from app.services.frame_service import FrameService
from app.services.ai_prediction_service_v2 import AIPredictionService
from app.core.file_storage import FileStorageService


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
    frames: list[Frame]
    total_frames_analyzed: int
    runs_found: int
    compliant_frames: int


class AutoFrameService:
    """Service for automatic frame extraction using runs-based algorithm"""
    
    def __init__(self, db: Session):
        self.db = db
        self.media_service = MediaService(db)
        self.frame_service = FrameService(db)
        self.file_storage = FileStorageService()
        self.ai_service = AIPredictionService(db)
        self.classifier_service_url = "http://frame-classifier-service:8000"

    def get_video_frames(self, video_path: str) -> tuple[list[np.ndarray], float]:
        """Extract all frames from a video file"""
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        frames = []
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            frames.append(np.array(frame, dtype=np.uint8))
        cap.release()
        return frames, fps

    def get_runs(
        self, 
        predictions: np.ndarray, 
        params: AutoExtractionParams
    ) -> list[Run]:
        """Get runs of predictions above threshold"""
        runs: list[Run] = []
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
                    max_index = int(np.argmax(predictions[run_start:run_end + 1]) + run_start)
                    max_prob = predictions[max_index]
                    runs.append(Run(
                        start=run_start, 
                        max_prob=max_prob, 
                        max_index=max_index, 
                        length=run_length
                    ))
                run_start = None
                patience_counter = 0
        if run_start is not None:
            run_end = len(predictions) - 1
            run_length = run_end - run_start + 1
            if run_length >= params.min_run_length:
                max_index = int(np.argmax(predictions[run_start:run_end + 1]) + run_start)
                max_prob = predictions[max_index]
                runs.append(Run(
                    start=run_start, 
                    max_prob=max_prob, 
                    max_index=max_index, 
                    length=run_length
                ))
        return runs
    
    async def extract_frames_auto(
        self, 
        video_media_id: UUID, 
        doctor_id: UUID,
        study_id: UUID,
        params: AutoExtractionParams
    ) -> AutoExtractionResult:
        """
        Automatically extract frames from video using runs-based algorithm
        """
        try:
            if not self.media_service.check_study_ownership(study_id, doctor_id):
                raise PermissionError(f"Access denied for video {video_media_id}")
            video_media = self.db.query(Media).filter(Media.id == video_media_id).first()
            if not video_media or video_media.media_type.value != MediaType.VIDEO.value:
                raise ValueError(f"Video media not found: {video_media_id}")
            try:
                file_data, file_name = self.file_storage.read_file(str(video_media.file_path))
                logger.debug(f"Read video file {file_name} of size {len(file_data)} bytes")
            except Exception as e:
                raise FileNotFoundError(f"Video file not accessible: {e}")
            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as video_temp:
                video_temp.write(file_data)
                video_temp_path = video_temp.name
                logger.debug(f"Temporary video file created at {video_temp_path}")
            try:
                logger.debug(f"Extracting frames from video {video_media_id}")
                video_frames, video_fps = self.get_video_frames(video_temp_path)
                logger.debug(f"Extracted {len(video_frames)} frames at {video_fps} FPS")
                if os.path.exists(video_temp_path):
                    os.unlink(video_temp_path)
                total_frames = len(video_frames)
                if total_frames == 0:
                    raise ValueError("No frames could be extracted from video")
                logger.debug(f"Processing {total_frames} frames for prediction")
                model_info = await self.ai_service.get_model_info("classifier")
                if not model_info:
                    raise RuntimeError("Classifier model not available in AI service")
                model_version = model_info.get("version", "unknown")
                predictions = await self._predict_frames_with_ai_service(video_frames)
                runs = self.get_runs(predictions, params)
                logger.debug(f"Found {len(runs)} runs in video {video_media_id}")
                extracted_frames = []
                for run in runs:
                    if run.max_prob >= params.prediction_threshold:
                        frame_index = run.max_index
                        logger.debug(f"Extracting frame at index {frame_index} with prob {run.max_prob}")
                        timestamp_seconds = frame_index / video_fps
                        try:
                            frame, _ = self.frame_service.extract_frame_at_timestamp(
                                video_media_id,
                                timestamp_seconds,
                                doctor_id,
                                study_id
                            )
                            if frame:
                                frame_media_id = cast(UUID, frame.frame_media_id)
                                extracted_frames.append(frame)
                                if self.ai_service.get_cached_classification_prediction(
                                    frame_media_id, model_version
                                ):
                                    continue
                                self.ai_service._cache_classification_prediction(
                                    frame_media_id,
                                    MediaType.FRAME.value,
                                    run.max_prob,
                                    model_version
                                )
                        except Exception as e:
                            logger.error(f"Failed to extract frame at index {frame_index}: {e}")
                            continue
                self.db.commit()
                return AutoExtractionResult(
                    frames=extracted_frames,
                    total_frames_analyzed=total_frames,
                    runs_found=len(runs),
                    compliant_frames=len(extracted_frames)
                )
            finally:
                if os.path.exists(video_temp_path):
                    os.unlink(video_temp_path)
        except Exception as e:
            logger.error(f"Error in auto frame extraction for video {video_media_id}: {e}")
            self.db.rollback()
            raise e

    async def _predict_frames_with_ai_service(self, video_frames: list[np.ndarray]) -> np.ndarray:
        """Predict frame usefulness using the AI service"""
        try:
            logger.debug(f"Predicting usefulness for {len(video_frames)} frames")
            predictions = []
            tasks = []
            batch_size = 50
            for i in range(0, len(video_frames), batch_size):
                batch_frames = video_frames[i:i + batch_size]
                tasks.append(self._predict_batch_frames(batch_frames))
            batch_predictions = await asyncio.gather(*tasks)
            for batch in batch_predictions:
                predictions.extend(batch)
                logger.debug(f"Processed batch {i//batch_size + 1}/{(len(video_frames) + batch_size - 1)//batch_size}")
            return np.array(predictions)
        except Exception as e:
            logger.error(f"Error predicting frames with AI service: {e}")
            return np.zeros(len(video_frames))
    
    async def _predict_batch_frames(self, frames: list[np.ndarray]) -> list[float]:
        """Predict a batch of frames using direct HTTP call to classifier service"""
        predictions = []
        for frame in frames:
            try:
                height, width = frame.shape
                frame_b64 = base64.b64encode(frame).decode('ascii')
                prediction_score = await self._call_classifier_service(frame_b64, width, height)
                predictions.append(prediction_score)
            except Exception as e:
                logger.warning(f"Error predicting single frame: {e}")
                predictions.append(0.0)
        return predictions
    
    async def _call_classifier_service(self, image_data_b64: str, width: int, height: int) -> float:
        """Make direct HTTP call to classifier service"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.classifier_service_url}/predict",
                    json={"data": image_data_b64, "width": width, "height": height}
                )
                if response.status_code == 200:
                    result = response.json()
                    return float(result.get("prediction", 0.0))
                else:
                    logger.warning(f"Classifier service returned status {response.status_code}")
                    return 0.0
        except Exception as e:
            logger.warning(f"Error calling classifier service: {e}")
            return 0.0

    async def generate_video_thumbnails(
        self,
        video_media_id: UUID,
        doctor_id: UUID,
        study_id: UUID,
        thumbnail_count: int = 20
    ) -> list[dict]:
        """
        Generate thumbnail strip for video scrubbing interface.
        
        Args:
            video_media_id: ID of the video media
            doctor_id: ID of the doctor requesting thumbnails
            study_id: ID of the study containing the video
            thumbnail_count: Number of thumbnails to generate (default: 20)
            
        Returns:
            List of thumbnail data with timestamps and base64 images
        """
        try:
            # Verify permissions
            if not self.media_service.check_study_ownership(study_id, doctor_id):
                raise PermissionError(f"Access denied for video {video_media_id}")
            
            # Get video media
            video_media = self.db.query(Media).filter(Media.id == video_media_id).first()
            if not video_media or video_media.media_type.value != MediaType.VIDEO.value:
                raise ValueError(f"Video media not found: {video_media_id}")
            
            # Read video file
            try:
                file_data, _ = self.file_storage.read_file(str(video_media.file_path))
                logger.debug(f"Read video file of size {len(file_data)} bytes for thumbnails")
            except Exception as e:
                raise FileNotFoundError(f"Video file not accessible: {e}")
            
            # Create temporary file
            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as video_temp:
                video_temp.write(file_data)
                video_temp_path = video_temp.name
                logger.debug(f"Temporary video file created at {video_temp_path}")
            
            try:
                # Open video and get basic info
                cap = cv2.VideoCapture(video_temp_path)
                if not cap.isOpened():
                    raise ValueError("Could not open video file")
                
                fps = cap.get(cv2.CAP_PROP_FPS)
                total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                duration_seconds = total_frames / fps if fps > 0 else 0
                
                logger.debug(f"Video info: {total_frames} frames, {fps} FPS, {duration_seconds:.2f}s")
                
                # Calculate thumbnail positions evenly distributed across video
                thumbnails = []
                for i in range(thumbnail_count):
                    # Calculate timestamp for this thumbnail
                    progress = i / (thumbnail_count - 1) if thumbnail_count > 1 else 0
                    timestamp_seconds = progress * duration_seconds
                    frame_number = int(timestamp_seconds * fps)
                    
                    # Seek to frame
                    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
                    ret, frame = cap.read()
                    
                    if ret:
                        # Resize frame for thumbnail (maintain aspect ratio)
                        height, width = frame.shape[:2]
                        thumbnail_width = 160  # Standard thumbnail width
                        thumbnail_height = int((thumbnail_width * height) / width)
                        
                        thumbnail_frame = cv2.resize(frame, (thumbnail_width, thumbnail_height))
                        
                        # Encode as JPEG for efficient transmission
                        _, encoded_frame = cv2.imencode('.jpg', thumbnail_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                        frame_b64 = base64.b64encode(encoded_frame.tobytes()).decode('utf-8')
                        
                        thumbnails.append({
                            'timestamp': timestamp_seconds,
                            'frame_number': frame_number,
                            'image_data': f"data:image/jpeg;base64,{frame_b64}",
                            'width': thumbnail_width,
                            'height': thumbnail_height
                        })
                        
                        logger.debug(f"Generated thumbnail {i+1}/{thumbnail_count} at {timestamp_seconds:.2f}s")
                    else:
                        logger.warning(f"Could not extract frame at position {frame_number}")
                
                cap.release()
                logger.info(f"Generated {len(thumbnails)} thumbnails for video {video_media_id}")
                
                return thumbnails
                
            finally:
                # Cleanup temporary file
                if os.path.exists(video_temp_path):
                    os.unlink(video_temp_path)
                    
        except Exception as e:
            logger.error(f"Error generating video thumbnails for {video_media_id}: {e}")
            raise

