"""
Global streaming session manager for persistent session storage.
"""

import json
import logging
from datetime import datetime
from typing import Optional, Self
from uuid import UUID

from app.core.cache import redis_client
from app.models.streaming import StreamingSession

logger = logging.getLogger(__name__)


class StreamingSessionManager:
    """Redis-backed streaming session manager for multi-worker environments"""
    
    _instance: Optional[Self] = None
    _initialized: bool = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(StreamingSessionManager, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not StreamingSessionManager._initialized:
            self.redis = redis_client
            self.session_ttl = 7200  # 2 hours TTL for sessions
            self.redis_available = True
            self._check_redis_connection()
            StreamingSessionManager._initialized = True
    
    def _serialize_session(self, session: StreamingSession) -> dict:
        """Serialize session to dict, excluding file_handle"""
        return {
            'id': session.id,
            'study_id': str(session.study_id),
            'doctor_id': str(session.doctor_id),
            'video_media_id': str(session.video_media_id),
            'created_at': session.created_at.isoformat(),
            'file_path': session.file_path,
            'total_size': session.total_size,
            'frame_count': session.frame_count,
            'duration_seconds': session.duration_seconds,
            'last_frame_time': session.last_frame_time.isoformat() if session.last_frame_time else None,
            'is_active': session.is_active
        }
    
    def _deserialize_session(self, data: dict) -> StreamingSession:
        """Deserialize session from dict, reopening file_handle if needed"""
        file_handle = None
        if data['is_active']:
            try:
                file_handle = open(data['file_path'], 'ab')
            except Exception as e:
                logger.warning(f"Failed to reopen file handle for session {data['id']}: {e}")
        
        return StreamingSession(
            id=data['id'],
            study_id=UUID(data['study_id']),
            doctor_id=UUID(data['doctor_id']),
            video_media_id=UUID(data['video_media_id']),
            created_at=datetime.fromisoformat(data['created_at']),
            file_handle=file_handle,
            file_path=data['file_path'],
            total_size=data['total_size'],
            frame_count=data['frame_count'],
            duration_seconds=data['duration_seconds'],
            last_frame_time=datetime.fromisoformat(data['last_frame_time']) if data['last_frame_time'] else None,
            is_active=data['is_active']
        )
    
    def create_session(self, session_id: str, session: StreamingSession):
        """Create/add a streaming session"""
        try:
            session_data = self._serialize_session(session)
            self.redis.setex(f"streaming:session:{session_id}", self.session_ttl, json.dumps(session_data))
            logger.info(f"Added streaming session {session_id} to Redis")
        except Exception as e:
            logger.error(f"Failed to store session {session_id} in Redis: {e}")
            raise
    
    def init_prediction_state(self, session_id: str):
        """Initialize prediction state for a session"""
        try:
            self.redis.setex(f"streaming:predictions:{session_id}", self.session_ttl, json.dumps([]))
        except Exception as e:
            logger.error(f"Failed to initialize prediction state for session {session_id}: {e}")
    
    def init_run_state(self, session_id: str):
        """Initialize run state for a session"""
        run_state = {
            'current_run_start': None,
            'patience_counter': 0,
            'frames_in_run': 0,
            'frame_count': 0,
            'early_yield_used': False,
            'highest_score_in_run': 0.0,
            'highest_score_frame_idx': None
        }
        try:
            self.redis.setex(f"streaming:run_state:{session_id}", self.session_ttl, json.dumps(run_state))
        except Exception as e:
            logger.error(f"Failed to initialize run state for session {session_id}: {e}")
    
    def get_session(self, session_id: str) -> Optional[StreamingSession]:
        """Get a streaming session"""
        try:
            session_data = self.redis.get(f"streaming:session:{session_id}")
            if session_data:
                return self._deserialize_session(json.loads(session_data)) # type: ignore
            return None
        except Exception as e:
            logger.error(f"Failed to get session {session_id} from Redis: {e}")
            return None
    
    def remove_session(self, session_id: str):
        """Remove a streaming session"""
        try:
            session = self.get_session(session_id)
            if session and session.file_handle:
                try:
                    session.file_handle.close()
                except Exception as e:
                    logger.warning(f"Failed to close file handle for session {session_id}: {e}")
            
            keys_to_delete = [
                f"streaming:session:{session_id}",
                f"streaming:predictions:{session_id}",
                f"streaming:run_state:{session_id}"
            ]
            self.redis.delete(*keys_to_delete)
            logger.info(f"Removed streaming session {session_id} from Redis")
        except Exception as e:
            logger.error(f"Failed to remove session {session_id} from Redis: {e}")
    
    def get_predictions(self, session_id: str) -> list:
        """Get predictions for a session"""
        try:
            predictions_data = self.redis.get(f"streaming:predictions:{session_id}")
            if predictions_data:
                return json.loads(predictions_data) # type: ignore
            return []
        except Exception as e:
            logger.error(f"Failed to get predictions for session {session_id}: {e}")
            return []
    
    def add_prediction(self, session_id: str, prediction: float):
        """Add a prediction for a session"""
        try:
            predictions = self.get_predictions(session_id)
            predictions.append(prediction)
            self.redis.setex(f"streaming:predictions:{session_id}", self.session_ttl, json.dumps(predictions))
        except Exception as e:
            logger.error(f"Failed to add prediction for session {session_id}: {e}")
    
    def get_run_state(self, session_id: str) -> dict:
        """Get run state for a session"""
        try:
            run_state_data = self.redis.get(f"streaming:run_state:{session_id}")
            if run_state_data:
                return json.loads(run_state_data) # type: ignore
            return {}
        except Exception as e:
            logger.error(f"Failed to get run state for session {session_id}: {e}")
            return {}
    
    def update_run_state(self, session_id: str, state: dict):
        """Update run state for a session"""
        try:
            current_state = self.get_run_state(session_id)
            current_state.update(state)
            self.redis.setex(f"streaming:run_state:{session_id}", self.session_ttl, json.dumps(current_state))
        except Exception as e:
            logger.error(f"Failed to update run state for session {session_id}: {e}")
    
    def get_all_sessions(self) -> dict[str, StreamingSession]:
        """Get all active sessions"""
        try:
            sessions = {}
            session_keys = self.redis.keys("streaming:session:*")
            for key in session_keys: # type: ignore
                session_id = key.split(":")[-1]  # Extract session ID from key
                session = self.get_session(session_id)
                if session:
                    sessions[session_id] = session
            return sessions
        except Exception as e:
            logger.error(f"Failed to get all sessions from Redis: {e}")
            return {}
    
    def session_exists(self, session_id: str) -> bool:
        """Check if session exists"""
        try:
            return bool(self.redis.exists(f"streaming:session:{session_id}"))
        except Exception as e:
            logger.error(f"Failed to check session existence for {session_id}: {e}")
            return False

    def cleanup_session_state(self, session_id: str):
        """Clean up prediction and run state for a session"""
        try:
            keys_to_delete = [
                f"streaming:predictions:{session_id}",
                f"streaming:run_state:{session_id}"
            ]
            self.redis.delete(*keys_to_delete)
            logger.info(f"Cleaned up state for session {session_id}")
        except Exception as e:
            logger.error(f"Failed to cleanup session state for {session_id}: {e}")

    def count_active_sessions(self) -> int:
        """Count active sessions"""
        try:
            sessions = self.get_all_sessions()
            return len([s for s in sessions.values() if s.is_active])
        except Exception as e:
            logger.error(f"Failed to count active sessions: {e}")
            return 0

    def get_all_session_ids(self) -> list:
        """Get all session IDs"""
        try:
            session_keys = self.redis.keys("streaming:session:*")
            return [key.split(":")[-1] for key in session_keys]  # type: ignore
        except Exception as e:
            logger.error(f"Failed to get all session IDs: {e}")
            return []
    
    def update_session(self, session_id: str, session: StreamingSession):
        """Update an existing session in Redis"""
        try:
            session_data = self._serialize_session(session)
            self.redis.setex(f"streaming:session:{session_id}", self.session_ttl, json.dumps(session_data))
            logger.debug(f"Updated streaming session {session_id} in Redis")
        except Exception as e:
            logger.error(f"Failed to update session {session_id} in Redis: {e}")
            raise
    
    def _check_redis_connection(self):
        """Check if Redis is available and log status"""
        try:
            self.redis.ping()
            self.redis_available = True
            logger.info("Redis connection established for streaming sessions")
        except Exception as e:
            self.redis_available = False
            logger.error(f"Redis connection failed for streaming sessions: {e}")
            logger.warning("Streaming sessions will not work properly without Redis in multi-worker environments")


streaming_session_manager = StreamingSessionManager()
