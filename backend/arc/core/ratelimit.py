"""Fixed-window rate limiting on Redis, shared by every API instance."""

import time

from redis.asyncio import Redis

from arc.core.errors import AppError


async def enforce_rate_limit(redis: Redis, name: str, key: str, limit: int, window_s: int) -> None:
    """Counts one hit; raises 429 once ``limit`` hits happen inside a window."""
    window = int(time.time()) // window_s
    redis_key = f"rl:{name}:{key}:{window}"
    async with redis.pipeline(transaction=True) as pipe:
        pipe.incr(redis_key)
        pipe.expire(redis_key, window_s + 1)
        hits, _ = await pipe.execute()
    if hits > limit:
        retry_after = window_s - int(time.time()) % window_s
        raise AppError(
            429,
            "RATE_LIMITED",
            "Too many attempts. Please wait a moment and try again.",
            {"retry_after_s": retry_after},
            headers={"Retry-After": str(retry_after)},
        )
