import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import fs from "node:fs";
import path from "node:path";

// Check environment directly to avoid circular dependency with config
const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";
const isDevelopment = !isProduction;

// Get log level from environment variable, with sensible defaults
// Valid levels: error, warn, info, http, debug
const getLogLevel = (): string => {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase();
    const validLevels = ["error", "warn", "info", "http", "debug"];

    if (envLevel && validLevels.includes(envLevel)) {
        return envLevel;
    }

    // Default: debug in development, info in production
    return isDevelopment ? "debug" : "info";
};

// Define log levels
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};

// Define log colors
const colors = {
    error: "red",
    warn: "yellow",
    info: "green",
    http: "magenta",
    debug: "white",
};

winston.addColors(colors);

// Custom format to flatten metadata and avoid double nesting
const flattenMetadata = winston.format((info) => {
    // If metadata exists and is an object, merge it with top-level fields
    if (info.metadata && typeof info.metadata === "object" && !Array.isArray(info.metadata)) {
        // Extract metadata object
        const metadata = info.metadata as Record<string, unknown>;

        // Handle nested metadata object (double nesting case)
        let actualMetadata = metadata;
        if (metadata.metadata && typeof metadata.metadata === "object" && !Array.isArray(metadata.metadata)) {
            // If there's a nested metadata, use that and merge with outer metadata
            actualMetadata = { ...metadata.metadata, ...metadata };
            delete actualMetadata.metadata;
        }

        // Remove the metadata wrapper from top level
        delete info.metadata;

        // Merge metadata fields into top level, but don't overwrite existing top-level fields
        for (const key in actualMetadata) {
            // Skip if key already exists at top level (preserve top-level values)
            if (!(key in info) || info[key] === undefined) {
                info[key] = actualMetadata[key];
            }
        }
    }

    return info;
});

// Base log format with structured metadata
// Exclude important HTTP fields from metadata wrapper so they appear at top level
const baseFormat = winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss:ms" }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.metadata({
        fillExcept: [
            "message",
            "level",
            "timestamp",
            "module",
            "method",      // HTTP method (GET, POST, etc.)
            "path",        // Request path
            "apiPath",     // API endpoint path
            "url",         // Full URL
            "statusCode",  // HTTP status code
            "requestId",   // Request ID for tracing
            "ip",          // Client IP address
        ]
    }),
    flattenMetadata() // Flatten metadata to avoid double nesting
);

// JSON format for file logging (includes module context)
const jsonFormat = winston.format.combine(
    baseFormat,
    winston.format.json()
);

// Console format for development (more readable with module context)
const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.colorize({ all: true }),
    winston.format.printf((info) => {
        const { timestamp, level, message, module, ...meta } = info;
        const moduleStr = module ? `[${module}]` : "";
        let metaStr = "";

        // Remove metadata wrapper if present
        const cleanMeta = (meta.metadata || meta) as Record<string, unknown>;
        const hasStack = "stack" in cleanMeta && typeof cleanMeta.stack === "string";

        if (Object.keys(cleanMeta).length > 0 && !hasStack) {
            metaStr = ` ${JSON.stringify(cleanMeta, null, 2)}`;
        }

        // Include stack trace if present
        if (hasStack) {
            metaStr += `\n${cleanMeta.stack}`;
        }

        return `${timestamp} ${moduleStr} [${level}]: ${message}${metaStr}`;
    })
);

// Get the log level
const logLevel = getLogLevel();

// Ensure logs directory exists
const ensureLogsDirectory = (): string => {
    const logsDir = path.join(process.cwd(), "logs");
    try {
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
    } catch (error) {
        // Log to console as fallback if directory creation fails
        console.error("Failed to create logs directory:", error);
    }
    return logsDir;
};

// Always ensure logs directory exists
const logsDir = ensureLogsDirectory();

// Create transports array
const transports: winston.transport[] = [
    // Console transport - always enabled
    new winston.transports.Console({
        format: isDevelopment ? consoleFormat : jsonFormat,
        level: logLevel,
    }),
];

// Add file transports (enabled in all environments unless explicitly disabled)
const enableFileLogging = process.env.ENABLE_FILE_LOGGING !== "false";

if (enableFileLogging) {
    // Unified application log (all levels)
    const appLogTransport = new DailyRotateFile({
        dirname: logsDir,
        filename: "app-%DATE%.log",
        datePattern: "YYYY-MM-DD",
        format: jsonFormat,
        level: logLevel,
        maxSize: "20m", // 20MB per file
        maxFiles: "7d", // Keep files for 7 days, then auto-delete
        zippedArchive: true, // Compress old files
        auditFile: path.join(logsDir, ".app-audit.json"),
    });

    // Unified error log (errors only)
    const errorLogTransport = new DailyRotateFile({
        dirname: logsDir,
        filename: "error-%DATE%.log",
        datePattern: "YYYY-MM-DD",
        format: jsonFormat,
        level: "error",
        maxSize: "20m", // 20MB per file
        maxFiles: "7d", // Keep error logs for 7 days, then auto-delete
        zippedArchive: true,
        auditFile: path.join(logsDir, ".error-audit.json"),
    });

    transports.push(appLogTransport, errorLogTransport);
}

// Create single centralized logger instance
const logger = winston.createLogger({
    level: logLevel,
    levels,
    format: jsonFormat,
    transports,
    // Don't exit on handled exceptions
    exitOnError: false,
});

/**
 * Creates a logger instance with module context
 * All logs from this logger will include the module name in metadata
 * 
 * @param moduleName - Name of the module/component (e.g., "auth", "userController")
 * @returns Logger instance with module context
 * 
 * @example
 * const log = createLogger("auth");
 * log.info("User logged in", { userId: 123 }); // Logs with module: "auth"
 */
export const createLogger = (moduleName: string) => {
    return {
        error: (message: string, ...meta: unknown[]) => {
            logger.error(message, { module: moduleName, ...extractMeta(meta) });
        },
        warn: (message: string, ...meta: unknown[]) => {
            logger.warn(message, { module: moduleName, ...extractMeta(meta) });
        },
        info: (message: string, ...meta: unknown[]) => {
            logger.info(message, { module: moduleName, ...extractMeta(meta) });
        },
        http: (message: string, ...meta: unknown[]) => {
            logger.http(message, { module: moduleName, ...extractMeta(meta) });
        },
        debug: (message: string, ...meta: unknown[]) => {
            logger.debug(message, { module: moduleName, ...extractMeta(meta) });
        },
    };
};

/**
 * Helper function to extract metadata from variadic arguments
 * Handles both object metadata and multiple arguments
 */
function extractMeta(meta: unknown[]): Record<string, unknown> {
    if (meta.length === 0) {
        return {};
    }

    // If first argument is an object, use it as metadata
    if (meta.length === 1 && typeof meta[0] === "object" && meta[0] !== null && !Array.isArray(meta[0])) {
        return meta[0] as Record<string, unknown>;
    }

    // Otherwise, create metadata object with indexed values
    const result: Record<string, unknown> = {};
    meta.forEach((value, index) => {
        result[`arg${index}`] = value;
    });
    return result;
}

// This maintains compatibility with existing code while using the new approach
export const getModuleLogger = createLogger;
