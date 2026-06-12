import { getRedisClient, isRedisAvailable } from "../../utils/redis";
import { getModuleLogger } from "../../utils/logger";

const log = getModuleLogger("redis");

function hasRedisUrl(): boolean {
    return Boolean((process.env.REDIS_URL || "").trim());
}

export async function cacheGet<T = unknown>(key: string): Promise<T | null> {
    if (!hasRedisUrl()) {
        return null;
    }

    if (!(await isRedisAvailable())) {
        return null;
    }

    try {
        const redis = getRedisClient();
        const raw = await redis.get(key);
        if (!raw) return null;
        try {
            return JSON.parse(raw) as T;
        } catch {
            // fallback to raw string
            return (raw as unknown) as T;
        }
    } catch (err) {
        // don't fail hard on cache errors
         
        log.error("[redis] cacheGet error", err);
        return null;
    }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds?: number) {
    if (!hasRedisUrl()) {
        return;
    }

    if (!(await isRedisAvailable())) {
        return;
    }

    try {
        const redis = getRedisClient();
        const payload = typeof value === "string" ? value : JSON.stringify(value);
        if (ttlSeconds && ttlSeconds > 0) {
            await redis.set(key, payload, "EX", ttlSeconds);
            return;
        }
        await redis.set(key, payload);
    } catch (err) {
         
        log.error("[redis] cacheSet error", err);
    }
}

export async function cacheDel(key: string) {
    if (!hasRedisUrl()) {
        return;
    }

    if (!(await isRedisAvailable())) {
        return;
    }

    try {
        const redis = getRedisClient();
        await redis.del(key);
    } catch (err) {
         
        log.error("[redis] cacheDel error", err);
    }
}
