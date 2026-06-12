import { DEFAULT_REDIS_STARTUP_TIMEOUT_MS } from "../utils/redis";
import { getModuleLogger } from "../utils/logger";

const log = getModuleLogger("config");

function parsePositiveIntEnv(variableName: string, fallback: number): number {
  const rawValue = process.env[variableName];
  if (rawValue === undefined || rawValue.trim() === "") {
    return fallback;
  }

  const parsedValue = Number(rawValue);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    log.warn(
      `[config] Invalid ${variableName}="${rawValue}". Falling back to ${fallback}.`
    );
    return fallback;
  }

  return Math.trunc(parsedValue);
}

export const REDIS_STARTUP_TIMEOUT_MS = parsePositiveIntEnv(
  "REDIS_STARTUP_TIMEOUT_MS",
  DEFAULT_REDIS_STARTUP_TIMEOUT_MS
);

export const DATABASE_STARTUP_TIMEOUT_MS = parsePositiveIntEnv(
  "DATABASE_STARTUP_TIMEOUT_MS",
  10_000
);

export const DATABASE_HEALTHCHECK_INTERVAL_MS = parsePositiveIntEnv(
  "DATABASE_HEALTHCHECK_INTERVAL_MS",
  30_000
);

export const ENABLE_DATABASE_HEALTH_MONITOR =
  process.env.DATABASE_HEALTH_MONITOR !== "false";

export const SHUTDOWN_TIMEOUT_MS = parsePositiveIntEnv(
  "SHUTDOWN_TIMEOUT_MS",
  30_000
);
