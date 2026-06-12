import "dotenv/config";
import http from "node:http";
import app from "./server";
import { initSocket } from "./socket/index";
import { startScheduledBotWorker } from "./services/chat/chatSchedulerService";
import { aiCreditsService } from "./services/aiCreditsService";
import { config, validateConfig } from "./config";
import {
  DATABASE_HEALTHCHECK_INTERVAL_MS,
  DATABASE_STARTUP_TIMEOUT_MS,
  ENABLE_DATABASE_HEALTH_MONITOR,
  REDIS_STARTUP_TIMEOUT_MS,
  SHUTDOWN_TIMEOUT_MS,
} from "./config/runtimeConfig";
import {
  logDatabaseFailure,
  startDatabaseHealthMonitor,
  StartupAbortError,
  stopDatabaseHealthMonitor,
  waitForDatabaseReady,
} from "./lib/databaseLifecycle";
import { closeRuntimeResources } from "./lib/runtimeResources";
import { getModuleLogger } from "./utils/logger";
import {
  getRedisClient,
  REDIS_RECONNECT_ATTEMPTS,
  REDIS_RECONNECT_DELAY_MS,
  waitForRedisReady,
} from "./utils/redis";

const log = getModuleLogger("server");

let isShuttingDown = false;

// Validate configuration on startup
try {
  validateConfig();
} catch (error) {
  log.error(
    "[index] Configuration validation failed:",
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
}

// Create HTTP server
const server = http.createServer(app);

const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  log.info(`\n${signal} received. Starting graceful shutdown...`);
  stopDatabaseHealthMonitor();

  await closeRuntimeResources();

  server.close(() => {
    log.info("HTTP server closed");
    process.exit(0);
  });

  setTimeout(() => {
    log.error("Forced shutdown after timeout");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref?.();
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("uncaughtException", (error) => {
  log.error("[index] Uncaught Exception", {
    message: error.message,
    stack: error.stack,
    name: error.name,
  });
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  if (reason instanceof Error) {
    log.error("[index] Unhandled Rejection", {
      message: reason.message,
      stack: reason.stack,
      name: reason.name,
      promise: String(promise),
    });
  } else {
    log.error("[index] Unhandled Rejection", {
      reason: reason,
      reasonType: typeof reason,
      reasonStringified: String(reason),
      promise: String(promise),
    });
  }
  gracefulShutdown("unhandledRejection");
});

async function bootstrap(): Promise<void> {
  try {
    await waitForDatabaseReady(DATABASE_STARTUP_TIMEOUT_MS);
  } catch (error) {
    logDatabaseFailure(error, "startup");
    throw new StartupAbortError("Database startup check failed");
  }

  const redisRequired = config.redis.required;
  const redisUrl = (process.env.REDIS_URL || "redis://redis:6379").trim();
  if (!redisUrl) {
    if (redisRequired) {
      throw new StartupAbortError("REDIS_REQUIRED=true but REDIS_URL is not configured");
    }
    log.warn("[index] REDIS_URL not configured; continuing without Redis (fallback mode enabled)");
  } else {
    const redis = getRedisClient();

    redis.on("end", () => {
      if (isShuttingDown) {
        return;
      }

      if (redisRequired) {
        log.error("[index] Redis connection ended after max retry attempts. Forcing server shutdown.", {
          attempts: REDIS_RECONNECT_ATTEMPTS,
          retryDelayMs: REDIS_RECONNECT_DELAY_MS,
          status: redis.status,
        });
        void gracefulShutdown("redis-end");
        return;
      }

      log.warn("[index] Redis connection ended. Continuing in fallback mode.", {
        attempts: REDIS_RECONNECT_ATTEMPTS,
        retryDelayMs: REDIS_RECONNECT_DELAY_MS,
        status: redis.status,
      });
    });

    const redisReady = await waitForRedisReady(REDIS_STARTUP_TIMEOUT_MS);

    if (!redisReady) {
      const payload = {
        message: `Redis did not become ready after ${REDIS_RECONNECT_ATTEMPTS} attempts with ${REDIS_RECONNECT_DELAY_MS}ms delay`,
        startupTimeoutMs: REDIS_STARTUP_TIMEOUT_MS,
        status: redis.status,
      };

      if (redisRequired) {
        log.error("[index] Redis connection check failed:", payload);
        log.error("[index] Exiting because REDIS_REQUIRED=true");
        isShuttingDown = true;
        stopDatabaseHealthMonitor();
        await closeRuntimeResources();
        process.exit(1);
      } else {
        log.warn("[index] Redis unavailable at startup; continuing in fallback mode", payload);
      }
    } else {
      log.info("Redis connection check passed");
    }
  }

  initSocket(server);
  server.listen(config.server.port, () => {
    log.info(`Backend server listening on port ${config.server.port}`);
    log.info(`Environment: ${config.server.nodeEnv}`);
  });

  startDatabaseHealthMonitor({
    enabled: ENABLE_DATABASE_HEALTH_MONITOR,
    intervalMs: DATABASE_HEALTHCHECK_INTERVAL_MS,
    timeoutMs: DATABASE_STARTUP_TIMEOUT_MS,
    isShuttingDown: () => isShuttingDown,
    onUnavailable: () => {
      void gracefulShutdown("database-unavailable");
    },
  });
  startScheduledBotWorker();
  aiCreditsService.startResetWorker();
}

void bootstrap().catch(async (error) => {
  if (!(error instanceof StartupAbortError)) {
    log.error("[index] Startup failed due to unexpected error.", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : "UnknownError",
    });
  }

  isShuttingDown = true;
  stopDatabaseHealthMonitor();
  await closeRuntimeResources();
  process.exit(1);
});
