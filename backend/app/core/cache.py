"""
Redis client configuration and connection.
"""


import logging
from typing import Optional
import redis

from app.core.config import settings


logger = logging.getLogger(__name__)


redis_client: redis.Redis = redis.from_url(
    settings.redis_url,
    decode_responses=True,
    health_check_interval=30
) # type: ignore


class RedisCache:
    """Redis cache wrapper for binary data storage"""
    
    def __init__(self, client: Optional[redis.Redis] = None):
        # Use a separate client without decode_responses for binary data
        if client is None:
            self.client = redis.from_url(
                settings.redis_url,
                decode_responses=False,  # Keep binary data as bytes
                health_check_interval=30
            )
        else:
            self.client = client
    
    def get(self, key: str) -> Optional[bytes]:
        """Get binary data from cache"""
        try:
            return self.client.get(key)  # type: ignore
        except Exception as e:
            logger.warning("Redis GET failed for key %s: %s", key, e)
            return None
    
    def set(self, key: str, value: bytes, ttl: int = 3600) -> bool:
        """Set binary data in cache with TTL in seconds"""
        try:
            return self.client.setex(key, ttl, value)  # type: ignore
        except Exception as e:
            logger.warning("Redis SET failed for key %s: %s", key, e)
            return False
    
    def delete(self, key: str) -> bool:
        """Delete key from cache"""
        try:
            return bool(self.client.delete(key))
        except Exception as e:
            logger.warning("Redis DELETE failed for key %s: %s", key, e)
            return False


def get_redis_cache() -> RedisCache:
    """Get a RedisCache instance for binary data operations"""
    return RedisCache()
