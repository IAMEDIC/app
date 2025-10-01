"""
Global streaming session manager for persistent session storage.
"""

import logging
from typing import Dict, Optional
from app.models.streaming import StreamingSession

logger = logging.getLogger(__name__)


class StreamingSessionManager:
    """Singleton class to manage streaming sessions across requests"""
    
    _instance: Optional['StreamingSessionManager'] = None
    _sessions: Dict[str, StreamingSession] = {}
    _predictions: Dict[str, list] = {}
    _run_states: Dict[str, dict] = {}
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(StreamingSessionManager, cls).__new__(cls)
        return cls._instance
    
    def create_session(self, session_id: str, session: StreamingSession):
        """Create/add a streaming session"""
        self._sessions[session_id] = session
        logger.info(f"Added streaming session {session_id} to global manager")
    
    def init_prediction_state(self, session_id: str):
        """Initialize prediction state for a session"""
        self._predictions[session_id] = []
    
    def init_run_state(self, session_id: str):
        """Initialize run state for a session"""
        self._run_states[session_id] = {
            'current_run_start': None,
            'patience_counter': 0,
            'frames_in_run': 0,
            'frame_count': 0,
            'early_yield_used': False,
            'highest_score_in_run': 0.0,
            'highest_score_frame_idx': None
        }
    
    def get_session(self, session_id: str) -> Optional[StreamingSession]:
        """Get a streaming session"""
        return self._sessions.get(session_id)
    
    def remove_session(self, session_id: str):
        """Remove a streaming session"""
        if session_id in self._sessions:
            del self._sessions[session_id]
        if session_id in self._predictions:
            del self._predictions[session_id]
        if session_id in self._run_states:
            del self._run_states[session_id]
        logger.info(f"Removed streaming session {session_id} from global manager")
    
    def get_predictions(self, session_id: str) -> list:
        """Get predictions for a session"""
        return self._predictions.get(session_id, [])
    
    def add_prediction(self, session_id: str, prediction: float):
        """Add a prediction for a session"""
        if session_id in self._predictions:
            self._predictions[session_id].append(prediction)
    
    def get_run_state(self, session_id: str) -> dict:
        """Get run state for a session"""
        return self._run_states.get(session_id, {})
    
    def update_run_state(self, session_id: str, state: dict):
        """Update run state for a session"""
        if session_id in self._run_states:
            self._run_states[session_id].update(state)
    
    def get_all_sessions(self) -> Dict[str, StreamingSession]:
        """Get all active sessions"""
        return self._sessions.copy()
    
    def session_exists(self, session_id: str) -> bool:
        """Check if session exists"""
        return session_id in self._sessions

    def cleanup_session_state(self, session_id: str):
        """Clean up prediction and run state for a session"""
        if session_id in self._predictions:
            del self._predictions[session_id]
        if session_id in self._run_states:
            del self._run_states[session_id]
        logger.info(f"Cleaned up state for session {session_id}")

    def count_active_sessions(self) -> int:
        """Count active sessions"""
        return len([s for s in self._sessions.values() if s.is_active])

    def get_all_session_ids(self) -> list:
        """Get all session IDs"""
        return list(self._sessions.keys())


# Global instance
streaming_session_manager = StreamingSessionManager()