import Redis from "ioredis";
import { getModuleLogger } from "./logger";

const log = getModuleLogger("redis");

// Create Redis client with connection pooling
let redisClient: Redis | null = null;
let lastErrorLogTime = 0;
let reconnectAttemptCount = 0;
let redisReady = false;
const ERROR_LOG_INTERVAL = 30000; // Log errors at most once every 30 seconds
export const REDIS_RECONNECT_ATTEMPTS = 10;
export const REDIS_RECONNECT_DELAY_MS = 2000;
export const DEFAULT_REDIS_STARTUP_TIMEOUT_MS =
    REDIS_RECONNECT_ATTEMPTS * REDIS_RECONNECT_DELAY_MS + REDIS_RECONNECT_DELAY_MS;

export function getRedisClient(): Redis {
    if (!redisClient) {
        const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

        redisClient = new Redis(redisUrl, {
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => {
                // Stop retrying after maximum attempts
                if (times > REDIS_RECONNECT_ATTEMPTS) {
                    log.error(
                        `Redis connection failed after ${REDIS_RECONNECT_ATTEMPTS} attempts. Stopping retries.`
                    );
                    return null; // Stop retrying
                }

                // Fixed retry delay requested for operational predictability.
                return REDIS_RECONNECT_DELAY_MS;
            },
            reconnectOnError: (err) => {
                const targetError = "READONLY";
                if (err.message.includes(targetError)) {
                    return true; // Reconnect on READONLY error
                }
                // Don't auto-reconnect on connection refused - let retryStrategy handle it
                return false;
            },
            enableOfflineQueue: false, // Don't queue commands when offline
            lazyConnect: false, // Connect immediately
        });

        redisClient.on("connect", () => {
            log.info("Redis client connected");
            reconnectAttemptCount = 0; // Reset counter on successful connection
        });

        redisClient.on("error", (err) => {
            redisReady = false;
            const now = Date.now();
            // Only log errors periodically to reduce log spam
            if (now - lastErrorLogTime > ERROR_LOG_INTERVAL) {
                log.error("Redis client error:", err);
                lastErrorLogTime = now;
            }
        });

        redisClient.on("close", () => {
            redisReady = false;
            // Only log close events periodically
            const now = Date.now();
            if (now - lastErrorLogTime > ERROR_LOG_INTERVAL) {
                log.warn("Redis client connection closed");
                lastErrorLogTime = now;
            }
        });

        redisClient.on("reconnecting", (delay: number) => {
            reconnectAttemptCount++;
            log.info(
                `Redis client reconnecting... (attempt ${reconnectAttemptCount}/${REDIS_RECONNECT_ATTEMPTS}, delay: ${delay}ms)`
            );
        });

        redisClient.on("ready", () => {
            log.info("Redis client ready");
            reconnectAttemptCount = 0;
            redisReady = true;
        });

        redisClient.on("end", () => {
            redisReady = false;
        });
    }

    return redisClient;
}

// Graceful shutdown
export async function closeRedis(): Promise<void> {
    if (!redisClient) {
        return;
    }

    const client = redisClient;
    redisClient = null;
    redisReady = false;

    try {
        // With enableOfflineQueue=false, quit() throws if the stream is not writable.
        // Only attempt a graceful QUIT when Redis is fully ready; otherwise disconnect directly.
        if (client.status === "ready") {
            await client.quit();
        } else {
            client.disconnect();
        }
    } catch (error) {
        log.warn("Error during Redis shutdown, forcing disconnect:", error);
        client.disconnect();
    } finally {
        log.info("Redis client closed");
    }
}

// Fast availability check for request paths. Do not ping Redis on every call.
export async function isRedisAvailable(): Promise<boolean> {
    if (!redisClient) {
        return false;
    }

    return redisReady && redisClient.status === "ready";
}

// Wait for Redis to become writable before issuing commands.
export async function waitForRedisReady(timeoutMs = 5000): Promise<boolean> {
    const client = getRedisClient();
    if (redisReady && client.status === "ready") {
        return true;
    }

    return new Promise<boolean>((resolve) => {
        let settled = false;

        const cleanup = () => {
            clearTimeout(timeout);
            client.off("ready", onReady);
            client.off("end", onEnd);
        };

        const finish = (ready: boolean) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(ready);
        };

        const onReady = () => {
            redisReady = true;
            finish(true);
        };

        const onEnd = () => {
            redisReady = false;
            finish(false);
        };

        const timeout = setTimeout(() => {
            finish(redisReady && client.status === "ready");
        }, timeoutMs);

        client.on("ready", onReady);
        client.on("end", onEnd);

        // Re-check after listeners are attached to avoid a race.
        if (redisReady && client.status === "ready") {
            finish(true);
        }
    });
}
