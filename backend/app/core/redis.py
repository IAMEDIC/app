import redis
from .config import settings

# Create Redis connection
redis_client = redis.from_url(
    settings.redis_url,
    decode_responses=True,
    health_check_interval=30
)


def get_redis():
    """Get Redis client"""
    return redis_client