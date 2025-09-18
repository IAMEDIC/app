"""
Redis client configuration and connection.
"""


import redis

from app.core.config import settings


redis_client: redis.Redis = redis.from_url(
    settings.redis_url,
    decode_responses=True,
    health_check_interval=30
) # type: ignore
