"""
Session service for managing user sessions with Redis inactivity tracking.
"""


import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.core.cache import redis_client
from app.core.config import settings


logger = logging.getLogger(__name__)


class SessionService:
    """Service for managing user sessions and inactivity tracking."""

    def __init__(self):
        self.redis = redis_client
        self.inactivity_timeout = timedelta(hours=settings.session_inactivity_timeout_hours)

    def create_session(self, user_id: str, user_email: str) -> str:
        """Create a new session and track it in Redis."""
        session_key = f"user_session:{user_id}"
        session_data = {
            "user_id": user_id,
            "user_email": user_email,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_activity": datetime.now(timezone.utc).isoformat()
        }
        self.redis.setex(
            session_key,
            int(self.inactivity_timeout.total_seconds()),
            json.dumps(session_data)
        )
        logger.info("✅ Created session for user: %s", user_email)
        return session_key

    def update_activity(self, user_id: str) -> bool:
        """Update user's last activity timestamp."""
        session_key = f"user_session:{user_id}"
        session_data_str = self.redis.get(session_key)
        
        if not session_data_str:
            logger.debug("🔍 No active session found for user: %s", user_id)
            return False
        
        try:
            session_data = json.loads(session_data_str) #type: ignore
            session_data["last_activity"] = datetime.now(timezone.utc).isoformat()
            self.redis.setex(
                session_key,
                int(self.inactivity_timeout.total_seconds()),
                json.dumps(session_data)
            )
            logger.debug("🔄 Updated activity for user: %s", user_id)
            return True
        except (json.JSONDecodeError, KeyError) as e:
            logger.error("❌ Failed to update session activity: %s", e)
            return False

    def is_session_active(self, user_id: str) -> bool:
        """Check if user has an active session."""
        session_key = f"user_session:{user_id}"
        return bool(self.redis.exists(session_key))

    def invalidate_session(self, user_id: str) -> bool:
        """Invalidate user session (logout)."""
        session_key = f"user_session:{user_id}"
        result = self.redis.delete(session_key)
        if result:
            logger.info("🚪 Session invalidated for user: %s", user_id)
        else:
            logger.debug("🔍 No session to invalidate for user: %s", user_id)
        return bool(result)

    def get_session_info(self, user_id: str) -> Optional[dict]:
        """Get session information for a user."""
        session_key = f"user_session:{user_id}"
        session_data_str = self.redis.get(session_key)
        if not session_data_str:
            return None
        try:
            return json.loads(session_data_str) #type: ignore
        except json.JSONDecodeError:
            logger.error("❌ Failed to parse session data for user: %s", user_id)
            return None
