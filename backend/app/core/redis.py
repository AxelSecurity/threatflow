import os, redis as _redis
_client = None
def get_redis() -> _redis.Redis:
    global _client
    if _client is None:
        _client = _redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"))
    return _client
