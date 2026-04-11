import redis
import os

_client = None

def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"))
    return _client
