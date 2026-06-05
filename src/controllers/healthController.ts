import { Request, Response } from "express";
import prisma from "../lib/prisma";
import { config } from "../config";
interface HealthCheckResult {
    status: "healthy" | "degraded" | "unhealthy";
    timestamp: string;
    environment: string;
    version?: string;
    uptime: number;
    checks: {
        database: {
            status: "healthy" | "unhealthy";
            responseTime?: number;
            error?: string;
        };
    };
}

/**
 * Health check endpoint
 * GET /health
 * 
 * Returns detailed health status including:
 * - Database connectivity
 * - System uptime
 * - Application version
 */
export async function healthCheckHandler(req: Request, res: Response): Promise<void> {
    const uptime = process.uptime();
    const exposeDependencyErrors = config.server.nodeEnv !== "production";

    const result: HealthCheckResult = {
        status: "healthy",
        timestamp: new Date().toISOString(),
        environment: config.server.nodeEnv,
        version: config.server.version,
        uptime: Math.floor(uptime),
        checks: {
            database: {
                status: "unhealthy",
            },
        },
    };

    // Check database connectivity
    try {
        const dbStartTime = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        const dbResponseTime = Date.now() - dbStartTime;

        result.checks.database = {
            status: "healthy",
            responseTime: dbResponseTime,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.checks.database = {
            status: "unhealthy",
            error: exposeDependencyErrors ? errorMessage : "Database unavailable",
        };
        result.status = "unhealthy";
    }

    // Set HTTP status code based on health status
    const httpStatus = result.status === "healthy" ? 200 : result.status === "degraded" ? 200 : 503;


    res.status(httpStatus).json(result);
}

