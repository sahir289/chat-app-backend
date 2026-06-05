import { getRedisClient, isRedisAvailable } from "../../utils/redis";

const fallbackStore = new Map<string, { count: number; resetTime: number }>();

function getRateLimitKeys(key: string): { counterKey: string; resetKey: string } {
    return {
        counterKey: `ratelimit:${key}`,
        resetKey: `ratelimit:data:${key}`,
    };
}

function consumeFallbackRateLimit(key: string, windowMs: number): { count: number; resetTime: number } {
    const now = Date.now();
    const existing = fallbackStore.get(key);

    if (!existing || existing.resetTime <= now) {
        const resetTime = now + windowMs;
        fallbackStore.set(key, { count: 1, resetTime });
        return { count: 1, resetTime };
    }

    existing.count += 1;
    return { count: existing.count, resetTime: existing.resetTime };
}

function pruneFallbackStore(): void {
    const now = Date.now();
    for (const [key, entry] of fallbackStore.entries()) {
        if (entry.resetTime <= now) {
            fallbackStore.delete(key);
        }
    }
}

export async function consumeRateLimit(
    key: string,
    windowMs: number
): Promise<{ count: number; resetTime: number }> {
    const redisAvailable = await isRedisAvailable();
    if (redisAvailable) {
        try {
            const redis = getRedisClient();
            const { counterKey, resetKey } = getRateLimitKeys(key);
            const count = await redis.incr(counterKey);

            if (count === 1) {
                const resetTime = Date.now() + windowMs;
                const ttlSeconds = Math.ceil(windowMs / 1000);
                await Promise.all([
                    redis.expire(counterKey, ttlSeconds),
                    redis.setex(resetKey, ttlSeconds, resetTime.toString()),
                ]);
                return { count, resetTime };
            }

            const resetTimeStr = await redis.get(resetKey);
            if (resetTimeStr) {
                return { count, resetTime: parseInt(resetTimeStr, 10) };
            }

            // Repair missing reset marker using the remaining counter TTL.
            const ttlMs = await redis.pttl(counterKey);
            const remainingMs = ttlMs > 0 ? ttlMs : windowMs;
            const resetTime = Date.now() + remainingMs;
            const ttlSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
            await redis.setex(resetKey, ttlSeconds, resetTime.toString());
            return { count, resetTime };
        } catch (_error) {
            // Fall back to in-memory rate limiting if Redis is unavailable.
        }
    }

    const result = consumeFallbackRateLimit(key, windowMs);
    pruneFallbackStore();
    return result;
}
