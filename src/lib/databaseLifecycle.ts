import { Prisma } from "@prisma/client";
import { config } from "../config";
import { getModuleLogger } from "../utils/logger";
import prisma from "./prisma";

const log = getModuleLogger("database");

export class StartupAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StartupAbortError";
  }
}

type DatabaseFailurePhase = "startup" | "runtime";

type DatabaseFailureDetails = {
  summary: string;
  action: string;
  technicalMessage: string;
  errorCode?: string;
};

type DatabaseHealthMonitorOptions = {
  enabled: boolean;
  intervalMs: number;
  timeoutMs: number;
  isShuttingDown: () => boolean;
  onUnavailable: () => void;
};

let databaseHealthTimer: NodeJS.Timeout | null = null;
let databaseHealthCheckInProgress = false;

function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
    timer.unref?.();

    operation
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function getDatabaseTarget(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return "DATABASE_URL is missing";
  }

  try {
    const parsed = new URL(databaseUrl);
    const databaseName = parsed.pathname.replace(/^\//, "") || "(default)";
    const port = parsed.port || "(default)";
    return `${parsed.hostname}:${port}/${databaseName}`;
  } catch {
    return "DATABASE_URL format invalid";
  }
}

function resolveDatabaseFailure(error: unknown): DatabaseFailureDetails {
  const technicalMessage = error instanceof Error ? error.message : String(error);
  const prismaInitError =
    error instanceof Prisma.PrismaClientInitializationError ? error : null;
  const errorCode = (
    prismaInitError as
      | (Prisma.PrismaClientInitializationError & { errorCode?: string })
      | null
  )?.errorCode;
  const message = technicalMessage.toLowerCase();

  if (technicalMessage.includes("DATABASE_URL is not set")) {
    return {
      summary: "Database startup failed because DATABASE_URL is missing.",
      action: "Set DATABASE_URL in backend/.env and restart the server.",
      technicalMessage,
      errorCode,
    };
  }

  if (errorCode === "P1000" || message.includes("authentication failed")) {
    return {
      summary: "Database authentication failed.",
      action: "Check username/password in DATABASE_URL and ensure the DB user has access.",
      technicalMessage,
      errorCode,
    };
  }

  if (errorCode === "P1001" || message.includes("can't reach database server")) {
    return {
      summary: "Database server is unreachable.",
      action: "Verify DB host, port, firewall, and that PostgreSQL is running.",
      technicalMessage,
      errorCode,
    };
  }

  if (errorCode === "P1002" || message.includes("timed out")) {
    return {
      summary: "Database connection timed out.",
      action: "Check network latency and database responsiveness, then retry.",
      technicalMessage,
      errorCode,
    };
  }

  if (errorCode === "P1003" || message.includes("does not exist")) {
    return {
      summary: "Configured database does not exist.",
      action: "Create the database or update DATABASE_URL with the correct database name.",
      technicalMessage,
      errorCode,
    };
  }

  if (errorCode === "P1010" || message.includes("permission denied")) {
    return {
      summary: "Database user does not have required permissions.",
      action: "Grant required permissions to the DB user used in DATABASE_URL.",
      technicalMessage,
      errorCode,
    };
  }

  if (errorCode === "P1013" || message.includes("database string is invalid")) {
    return {
      summary: "DATABASE_URL format is invalid.",
      action: "Use a valid PostgreSQL connection string in DATABASE_URL.",
      technicalMessage,
      errorCode,
    };
  }

  return {
    summary: "Database connection check failed due to an unknown error.",
    action: "Review DATABASE_URL and database status, then restart the server.",
    technicalMessage,
    errorCode,
  };
}

export function logDatabaseFailure(
  error: unknown,
  phase: DatabaseFailurePhase
): void {
  const details = resolveDatabaseFailure(error);
  const target = getDatabaseTarget();

  if (phase === "startup") {
    log.error("[database] Startup check failed. Server will stop.");
  } else {
    log.error("[database] Connection lost after startup. Server will stop.");
  }

  log.error(`[database] Reason: ${details.summary}`);
  log.error(`[database] Target: ${target}`);
  log.error(`[database] Action: ${details.action}`);

  if (!config.server.isProduction) {
    log.warn("[database] Debug details", {
      errorCode: details.errorCode || "UNKNOWN",
    });
  }
}

export async function waitForDatabaseReady(timeoutMs: number): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const start = Date.now();
  const startupDeadline = start + timeoutMs;

  const getRemainingTimeout = (phase: "connection" | "ping"): number => {
    const remainingMs = startupDeadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error(
        `Database ${phase} timed out within ${timeoutMs}ms startup deadline`
      );
    }
    return remainingMs;
  };

  await withTimeout(
    prisma.$connect(),
    getRemainingTimeout("connection"),
    `Database connection timed out within ${timeoutMs}ms startup deadline`
  );
  await withTimeout(
    prisma.$queryRaw`SELECT 1`,
    getRemainingTimeout("ping"),
    `Database ping timed out within ${timeoutMs}ms startup deadline`
  );

  log.info("Database connection check passed", {
    responseTimeMs: Date.now() - start,
  });
}

async function runDatabaseHealthCheck(
  options: DatabaseHealthMonitorOptions
): Promise<void> {
  if (options.isShuttingDown() || databaseHealthCheckInProgress) {
    return;
  }

  databaseHealthCheckInProgress = true;
  try {
    await withTimeout(
      prisma.$queryRaw`SELECT 1`,
      Math.min(options.timeoutMs, 5000),
      "Database runtime health check timed out"
    );
  } catch (error) {
    logDatabaseFailure(error, "runtime");
    options.onUnavailable();
  } finally {
    databaseHealthCheckInProgress = false;
  }
}

export function startDatabaseHealthMonitor(
  options: DatabaseHealthMonitorOptions
): void {
  if (!options.enabled || databaseHealthTimer) {
    return;
  }

  databaseHealthTimer = setInterval(() => {
    void runDatabaseHealthCheck(options);
  }, options.intervalMs);

  databaseHealthTimer.unref?.();
}

export function stopDatabaseHealthMonitor(): void {
  if (!databaseHealthTimer) {
    return;
  }

  clearInterval(databaseHealthTimer);
  databaseHealthTimer = null;
}
