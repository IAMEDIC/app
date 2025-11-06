"""
Real-time streaming service for live video capture and frame processing.
"""


import logging
import subprocess
import uuid
from typing import Optional, Any, cast
from datetime import datetime, timedelta
from uuid import UUID
import base64
import io
import os

import httpx            
import numpy as np
from sqlalchemy.orm import Session
from PIL import Image as PILImage

from app.models.media import Media, MediaType, UploadStatus
from app.models.frame import Frame
from app.services.media_service import MediaService
from app.services.frame_service import FrameService
from app.services.ai_prediction_service_v2 import AIPredictionService
from app.core.file_storage import FileStorageService
from app.core.streaming_manager import streaming_session_manager
from app.models.streaming import StreamingSession, FrameProcessingResult


logger = logging.getLogger(__name__)


def convert_image_to_base64_bytes(image: PILImage.Image) -> str:
    """Convert PIL Image to base64 encoded bytes"""
    if image.mode != 'L':
        image = image.convert('L')
    image_array = np.array(image, dtype=np.uint8)
    image_bytes = image_array.tobytes()
    return base64.b64encode(image_bytes).decode('ascii')


class RealTimeStreamingService:
    """Service for real-time video streaming and frame processing"""
    
    def __init__(self, db: Session):
        self.db = db
        self.media_service = MediaService(db)
        self.frame_service = FrameService(db) 
        self.file_storage = FileStorageService()
        self.ai_service = AIPredictionService(db)
        self.session_manager = streaming_session_manager
        self.frame_threshold = 0.8
        self.min_run_length = 10
        self.prediction_threshold = 0.95
        self.patience = 5

    async def create_streaming_session(
        self,
        study_id: UUID,
        doctor_id: UUID
    ) -> str:
        """
        Create a new streaming session with placeholder media record
        """
        try:
            if not self.media_service.check_study_ownership(study_id, doctor_id):
                raise ValueError("Study not found or access denied")
            doctor_file_ids = self.media_service.get_doctor_file_ids(doctor_id)
            storage_info = self.file_storage.get_storage_info(doctor_file_ids)
            if storage_info['used_bytes'] >= self.file_storage.MAX_TOTAL_STORAGE:
                raise ValueError("Storage limit exceeded. Cannot start new streaming session.")
            session_id = str(uuid.uuid4())
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"streaming_session_{timestamp}.webm"
            file_path = self.file_storage._get_file_path(session_id)
            file_handle = open(file_path, 'wb')
            media_data = {
                'study_id': study_id,
                'filename': filename,
                'file_path': session_id,
                'file_size': 0,
                'mime_type': 'video/webm',
                'media_type': MediaType.VIDEO,
                'upload_status': UploadStatus.PROCESSING
            }
            media = Media(**media_data)
            self.db.add(media)
            self.db.commit()
            self.db.refresh(media)
            session = StreamingSession(
                id=session_id,
                study_id=study_id,
                doctor_id=doctor_id,
                video_media_id=cast(UUID, media.id),
                created_at=datetime.now(),
                file_handle=file_handle,
                file_path=str(file_path),
                total_size=0,
                frame_count=0,
                duration_seconds=0.0,
                last_frame_time=None,
                is_active=True
            )
            self.session_manager.create_session(session_id, session)
            self.session_manager.init_prediction_state(session_id)
            self.session_manager.init_run_state(session_id)
            logger.info(f"Created streaming session {session_id} for study {study_id}")
            return session_id
        except Exception as e:
            logger.error(f"Failed to create streaming session: {e}")
            raise

    async def append_video_chunk(
        self,
        session_id: str,
        chunk_data: bytes
    ) -> bool:
        """
        Append video chunk to the streaming session file
        """
        try:
            session = self.session_manager.get_session(session_id)
            if not session:
                raise ValueError(f"Session not found: {session_id}")
            if not session.is_active:
                logger.info(f"Received chunk for finalized session {session_id}, accepting as final chunk")
                if not session.file_handle or session.file_handle.closed:
                    logger.warning(f"File handle closed for session {session_id}, ignoring chunk")
                    return True
            if not session.file_handle or session.file_handle.closed:
                try:
                    session.file_handle = open(session.file_path, 'ab')
                except Exception as e:
                    logger.error(f"Failed to reopen file handle for session {session_id}: {e}")
                    return False
            session.file_handle.write(chunk_data)
            session.file_handle.flush()
            session.total_size += len(chunk_data)
            if session.total_size > self.file_storage.MAX_FILE_SIZE:
                logger.warning(f"Session {session_id} exceeded 1GB file limit, stopping recording")
                session.is_active = False
                self.session_manager.update_session(session_id, session)
                self.db.query(Media).filter(Media.id == session.video_media_id).update({
                    'file_size': session.total_size,
                    'upload_status': UploadStatus.UPLOADED
                })
                self.db.commit()
                return False
            self.session_manager.update_session(session_id, session)
            self.db.query(Media).filter(Media.id == session.video_media_id).update(
                {'file_size': session.total_size}
            )
            self.db.commit()
            return True
        except Exception as e:
            logger.error(f"Failed to append video chunk to session {session_id}: {e}")
            return False

    async def process_frame_realtime(
        self,
        session_id: str,
        frame_data: bytes,
        timestamp_seconds: float
    ) -> FrameProcessingResult:
        """
        Process a frame in real-time for useful frame detection
        """
        start_time = datetime.now()
        try:
            session = self.session_manager.get_session(session_id)
            if not session or not session.is_active:
                logger.error("❌ Invalid or inactive session: %s", session_id)
                raise ValueError(f"Invalid or inactive session: {session_id}")
            confidence = await self._classify_frame(frame_data)
            predictions = self.session_manager.get_predictions(session_id)
            self.session_manager.add_prediction(session_id, confidence)
            is_useful, should_extract = self._evaluate_frame_usefulness(
                session_id, confidence, len(predictions) - 1
            )
            extracted_frame = None
            if should_extract:
                extracted_frame = await self._extract_frame_from_data(
                    session, frame_data, timestamp_seconds, len(predictions) - 1, confidence
                )
            session.last_frame_time = datetime.now()
            session.frame_count += 1
            session.duration_seconds = timestamp_seconds
            self.session_manager.update_session(session_id, session)
            processing_time = (datetime.now() - start_time).total_seconds() * 1000
            return FrameProcessingResult(
                is_useful_frame=is_useful,
                should_extract=should_extract,
                confidence_score=confidence,
                processing_time_ms=processing_time,
                extracted_frame_id=cast(UUID, extracted_frame.id) if extracted_frame else None,
                extracted_frame_media_id=cast(UUID, extracted_frame.frame_media_id) if extracted_frame else None
            )
            
        except Exception as e:
            logger.error(f"Failed to process frame for session {session_id}: {e}")
            processing_time = (datetime.now() - start_time).total_seconds() * 1000
            return FrameProcessingResult(
                is_useful_frame=False,
                should_extract=False,
                confidence_score=0.0,
                processing_time_ms=processing_time
            )

    async def _classify_frame(self, frame_data: bytes) -> float:
        """
        Classify frame using the frame classifier service
        """
        try:
            image = PILImage.open(io.BytesIO(frame_data)).convert('L')
            image_data_b64 = convert_image_to_base64_bytes(image)
            width, height = image.size
            image_data = {
                'data': image_data_b64,
                "width": width,
                "height": height
            }
            classifier_service_url = "http://frame-classifier-service:8000"
            async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
                logger.debug(f"📡 Calling {classifier_service_url}/predict for real-time classification")
                response = await client.post(
                    f"{classifier_service_url}/predict",
                    json=image_data
                )
                if response.status_code == 200:
                    result = response.json()
                    prediction = result.get('prediction', 0.0)
                    model_version = result.get('model_version', 'unknown')
                    logger.debug(f"🎯 Frame classification prediction: {prediction} (model: {model_version})")
                    return prediction
                else:
                    logger.warning(f"❌ Frame classification failed: {response.status_code}")
                    return 0.0
        except httpx.TimeoutException:
            logger.warning("⏱️ Frame classification timeout - using fallback")
        except Exception as e:
            logger.error(f"🌐 Frame classification error: {e}")
        return 0.0

    def _evaluate_frame_usefulness(
        self,
        session_id: str,
        confidence: float,
        frame_index: int
    ) -> tuple[bool, bool]:
        """
        Enhanced runs-based algorithm with early yield mechanism:
        - Trigger after 20 frames when confidence > 0.95
        - Return highest scoring frame and prevent future yields until score < 0.80
        """
        try:
            run_state = self.session_manager.get_run_state(session_id)
            is_above_threshold = confidence >= self.frame_threshold  # 0.8
            is_above_prediction_threshold = confidence >= self.prediction_threshold  # 0.95
            is_useful = False
            should_extract = False
            if is_above_threshold:
                if run_state['current_run_start'] is None:
                    run_state['current_run_start'] = frame_index
                    run_state['patience_counter'] = 0
                    run_state['frames_in_run'] = 1
                    run_state['highest_score_in_run'] = confidence
                    run_state['highest_score_frame_idx'] = frame_index
                    run_state['early_yield_used'] = False
                else:
                    run_state['frames_in_run'] += 1
                    run_state['patience_counter'] = 0
                    if confidence > run_state['highest_score_in_run']:
                        run_state['highest_score_in_run'] = confidence
                        run_state['highest_score_frame_idx'] = frame_index
                is_useful = True
                if (not run_state['early_yield_used'] and 
                    run_state['frames_in_run'] >= 20 and 
                    is_above_prediction_threshold):
                    logger.info(f"Early yield triggered at frame {frame_index}, confidence: {confidence:.3f}")
                    should_extract = True
                    run_state['early_yield_used'] = True                    
            else:
                if run_state['current_run_start'] is not None:
                    run_state['patience_counter'] += 1
                    if run_state['patience_counter'] > self.patience:
                        if run_state['frames_in_run'] >= self.min_run_length:
                            if not run_state['early_yield_used']:
                                should_extract = True
                                logger.info(f"Run ended, extracting highest scoring frame (idx: {run_state['highest_score_frame_idx']}, score: {run_state['highest_score_in_run']:.3f})")
                        run_state['current_run_start'] = None
                        run_state['patience_counter'] = 0
                        run_state['frames_in_run'] = 0
                        run_state['highest_score_in_run'] = 0.0
                        run_state['highest_score_frame_idx'] = None
                        run_state['early_yield_used'] = False
            self.session_manager.update_run_state(session_id, run_state)
            return is_useful, should_extract
        except Exception as e:
            logger.error(f"Error evaluating frame usefulness: {e}")
            return False, False

    def _process_unfinished_runs(self, session_id: str) -> Optional[int]:
        """
        Process any unfinished runs when streaming ends.
        Returns frame index to extract if there's a valid unfinished run.
        """
        try:
            run_state = self.session_manager.get_run_state(session_id)
            if (run_state['current_run_start'] is not None and 
                run_state['frames_in_run'] >= self.min_run_length and
                not run_state['early_yield_used'] and
                run_state['highest_score_frame_idx'] is not None):
                logger.info(f"Processing unfinished run: {run_state['frames_in_run']} frames, "
                           f"highest score: {run_state['highest_score_in_run']:.3f} at frame {run_state['highest_score_frame_idx']}")
                return run_state['highest_score_frame_idx']
            return None
        except Exception as e:
            logger.error(f"Error processing unfinished runs: {e}")
            return None

    async def _remux_video_file(self, input_path: str, output_path: str):
        """
        Remux video file using FFmpeg to fix corruption issues from chunked upload
        """
        logger.info(f"FFmpeg remux: input='{input_path}', output='{output_path}'")
        if input_path == output_path:
            raise Exception(f"Input and output paths are the same: {input_path}")
        cmd = [
            'ffmpeg',
            '-y',
            '-fflags', '+genpts+igndts',
            '-avoid_negative_ts', 'make_zero',
            '-analyzeduration', '2147483647',
            '-probesize', '2147483647',
            '-i', input_path,
            '-c', 'copy',
            '-f', 'webm',
            output_path
        ]
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=60
            )
            if result.returncode != 0:
                logger.warning(f"FFmpeg copy failed: {result.stderr}")
                cmd_reencode = [
                    'ffmpeg',
                    '-y',
                    '-fflags', '+genpts+igndts',
                    '-avoid_negative_ts', 'make_zero',
                    '-err_detect', 'ignore_err',
                    '-i', input_path,
                    '-c:v', 'libvpx',
                    '-crf', '23',
                    '-f', 'webm',
                    output_path
                ]
                result = subprocess.run(
                    cmd_reencode,
                    capture_output=True,
                    text=True,
                    timeout=120
                )                
                if result.returncode != 0:
                    raise Exception(f"FFmpeg re-encode also failed: {result.stderr}")
                logger.info(f"Successfully re-encoded video: {input_path} -> {output_path}")
            else:
                logger.info(f"Successfully remuxed video: {input_path} -> {output_path}")
        except subprocess.TimeoutExpired:
            raise Exception("FFmpeg processing timed out")
        except FileNotFoundError:
            raise Exception("FFmpeg not found - please install FFmpeg")

    async def _extract_frame_from_data(
        self,
        session: StreamingSession,
        frame_data: bytes,
        timestamp_seconds: float,
        frame_number: int,
        confidence: Optional[float] = None
    ) -> Optional[Frame]:
        """
        Extract and save frame from raw data
        """
        try:
            frame_filename = f"frame_{session.id}_{frame_number:06d}.jpg"
            frame_file_info = self.file_storage.create_file(frame_data, frame_filename)
            frame_media_data = {
                'study_id': session.study_id,
                'filename': frame_file_info.filename,
                'file_path': frame_file_info.file_id,
                'file_size': frame_file_info.file_size,
                'mime_type': frame_file_info.mime_type,
                'media_type': MediaType.FRAME,
                'upload_status': UploadStatus.UPLOADED,
                'is_active': True
            }
            frame_media = Media(**frame_media_data)
            self.db.add(frame_media)
            self.db.flush()
            image = PILImage.open(io.BytesIO(frame_data))
            width, height = image.size
            frame_media_id = cast(UUID, frame_media.id)
            frame_record_data = {
                'video_media_id': session.video_media_id,
                'frame_media_id': frame_media_id,
                'timestamp_seconds': timestamp_seconds,
                'frame_number': frame_number,
                'width': width,
                'height': height,
                'is_active': True
            }
            frame = Frame(**frame_record_data)
            self.db.add(frame)
            self.db.commit()
            self.db.refresh(frame)
            if confidence is not None:
                try:
                    model_info = await self.ai_service.get_model_info("classifier")
                    model_version = model_info.get("version", "unknown") if model_info else "unknown"
                    self.ai_service._cache_classification_prediction(
                        media_id=frame_media_id,
                        media_type=MediaType.FRAME.value,
                        prediction=confidence,
                        model_version=model_version,
                        force_refresh=False
                    )
                    logger.debug(f"Saved classification prediction {confidence} for frame {frame_number}")
                except Exception as pred_error:
                    logger.error(f"Failed to save classification prediction: {pred_error}")
            logger.info(f"Extracted frame {frame_number} at {timestamp_seconds}s for session {session.id}")
            return frame
        except Exception as e:
            logger.error(f"Failed to extract frame: {e}")
            return None

    async def finalize_streaming_session(
        self,
        session_id: str
    ) -> Optional[UUID]:
        """
        Finalize streaming session and update media record
        """
        try:
            session = self.session_manager.get_session(session_id)
            if not session:
                raise ValueError(f"Session not found: {session_id}")
            if session.file_handle:
                session.file_handle.close()
            original_file_path = session.file_path
            temp_original_path = session.file_path + '_original_backup'
            logger.info(f"Remuxing video: {original_file_path}")
            try:
                os.rename(original_file_path, temp_original_path)
                logger.info(f"Renamed original file to backup: {temp_original_path}")
                await self._remux_video_file(temp_original_path, original_file_path)
                os.remove(temp_original_path)
                logger.info(f"Deleted original backup file: {temp_original_path}")
                final_size = os.path.getsize(original_file_path)
                logger.info(f"Successfully remuxed video file for session {session_id}, final size: {final_size}")
                self.db.query(Media).filter(Media.id == session.video_media_id).update({
                    'upload_status': UploadStatus.UPLOADED,
                    'file_size': final_size
                })
                self.db.commit()
            except Exception as remux_error:
                logger.error(f"Failed to remux video file for session {session_id}: {remux_error}")
                try:
                    if os.path.exists(temp_original_path):
                        if os.path.exists(original_file_path):
                            os.remove(original_file_path)
                        os.rename(temp_original_path, original_file_path)
                        logger.info("Restored original file after remux failure")
                except Exception as restore_error:
                    logger.error(f"Failed to restore original file: {restore_error}")
                self.db.query(Media).filter(Media.id == session.video_media_id).update({
                    'upload_status': UploadStatus.UPLOADED,
                    'file_size': session.total_size
                })
                self.db.commit()
            unfinished_frame_idx = self._process_unfinished_runs(session_id)
            if unfinished_frame_idx is not None:
                logger.info(f"Extracting frame from unfinished run at index {unfinished_frame_idx}")
                try:
                    frame_timestamp = unfinished_frame_idx * 0.1
                    frame = Frame(
                        media_id=session.video_media_id,
                        frame_media_id=str(uuid.uuid4()),
                        timestamp_seconds=frame_timestamp,
                        frame_number=unfinished_frame_idx,
                        width=640,
                        height=480,
                        is_active=True
                    )
                    self.db.add(frame)
                    self.db.commit()
                    logger.info(f"Created frame record for unfinished run: {frame.id}")
                except Exception as frame_error:
                    logger.error(f"Failed to create frame for unfinished run: {frame_error}")
            session.is_active = False
            self.session_manager.update_session(session_id, session)
            logger.info(f"Finalized streaming session {session_id}, video size: {session.total_size}")
            return session.video_media_id
        except Exception as e:
            logger.error(f"Failed to finalize session {session_id}: {e}")
            return None

    def get_session_info(self, session_id: str) -> Optional[dict[str, Any]]:
        """Get information about an active streaming session"""
        session = self.session_manager.get_session(session_id)
        if not session:
            return None
        return {
            'id': session.id,
            'study_id': str(session.study_id),
            'video_media_id': str(session.video_media_id),
            'duration_seconds': session.duration_seconds,
            'total_size': session.total_size,
            'frame_count': session.frame_count,
            'is_active': session.is_active,
            'created_at': session.created_at.isoformat(),
            'last_frame_time': session.last_frame_time.isoformat() if session.last_frame_time else None
        }

    async def cleanup_inactive_sessions(self, max_age_hours: int = 2):
        """Clean up inactive or old streaming sessions"""
        try:
            cutoff_time = datetime.now() - timedelta(hours=max_age_hours)
            sessions_to_remove = []
            for session_id, session in self.session_manager.get_all_sessions().items():
                if (not session.is_active or 
                    session.created_at < cutoff_time or
                    (session.last_frame_time and 
                     session.last_frame_time < datetime.now() - timedelta(minutes=30))):
                    sessions_to_remove.append(session_id)
            for session_id in sessions_to_remove:
                await self._cleanup_session(session_id)
        except Exception as e:
            logger.error(f"Error during session cleanup: {e}")

    async def _cleanup_session(self, session_id: str):
        """Clean up a specific session"""
        try:
            session = self.session_manager.get_session(session_id)
            if not session:
                return
            logger.info(f"Cleaning up session {session_id}")
            if session.file_handle:
                try:
                    session.file_handle.close()
                except Exception as e:
                    logger.warning(f"Failed to close file handle for session {session_id}: {e}")
            if session.is_active:
                updated_rows = self.db.query(Media).filter(
                    Media.id == session.video_media_id,
                    Media.upload_status == UploadStatus.PROCESSING
                ).update({'upload_status': UploadStatus.FAILED})
                if updated_rows > 0:
                    self.db.commit()
                    logger.info(f"Marked media {session.video_media_id} as failed for session {session_id}")
            self.session_manager.remove_session(session_id)
            self.session_manager.cleanup_session_state(session_id)
            logger.info(f"Successfully cleaned up session {session_id}")
        except Exception as e:
            logger.error(f"Error cleaning up session {session_id}: {e}")

    async def get_active_sessions_count(self) -> int:
        """Get count of active streaming sessions"""
        return self.session_manager.count_active_sessions()

    async def force_cleanup_all_sessions(self):
        """Force cleanup of all active sessions (for emergency use)"""
        try:
            session_ids = self.session_manager.get_all_session_ids()
            for session_id in session_ids:
                await self._cleanup_session(session_id)
            logger.info(f"Force cleaned up {len(session_ids)} sessions")
        except Exception as e:
            logger.error(f"Error during force cleanup: {e}")

    def is_session_active(self, session_id: str) -> bool:
        """Check if a session is active"""
        session = self.session_manager.get_session(session_id)
        return session is not None and session.is_active