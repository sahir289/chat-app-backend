import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/appError";
import { Prisma } from "@prisma/client";
import { getModuleLogger } from "../utils/logger";
import { errorResponse } from "../utils/apiResponse";
import { config } from "../config";

const log = getModuleLogger("error");

const isProduction = config.server.isProduction;
const INTERNAL_SERVER_ERROR_MESSAGE = "Internal server error";

type ResolvedError = {
    statusCode: number;
    message: string;
    errorName: string;
    stack?: string;
    errors?: unknown;
};

function logServerError(req: Request, resolvedError: ResolvedError, rawMessage: string) {
    if (resolvedError.statusCode < 500) {
        return;
    }

    log.error("Request failed", { 
        method: req.method,
        path: req.originalUrl || req.path,
        status: resolvedError.statusCode,
        name: resolvedError.errorName,
        message: rawMessage,
        ...(isProduction || !resolvedError.stack ? {} : { stack: resolvedError.stack }),
    });
}

export function errorHandler(
    err: unknown,
    req: Request,
    res: Response,
    _next: NextFunction
) {
    let resolved: ResolvedError;
    let rawLogMessage =
        err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";

    if (err instanceof AppError) {
        const includeDetails =
            err.details !== undefined && (!isProduction || err.statusCode < 500);
        resolved = {
            statusCode: err.statusCode,
            message:
                err.statusCode >= 500 && isProduction
                    ? INTERNAL_SERVER_ERROR_MESSAGE
                    : err.message,
            errorName: err.name || "AppError",
            stack: err.stack,
            errors: includeDetails ? err.details : undefined,
        };
    } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
        resolved = {
            statusCode: 400,
            message: isProduction
                ? "Database operation failed"
                : `Database operation failed: ${err.message}`,
            errorName: err.name,
            stack: err.stack,
        };

        if (err.code === "P2002") {
            const target = err.meta?.target as string[] | undefined;
            const field = target?.[0] || "field";
            resolved = {
                statusCode: 400,
                message: `${field} already exists`,
                errorName: err.name,
                stack: err.stack,
            };
        } else if (err.code === "P2025") {
            resolved = {
                statusCode: 404,
                message: "Record not found",
                errorName: err.name,
                stack: err.stack,
            };
        } else if (err.code === "P2003") {
            const fieldName = err.meta?.field_name as string | undefined;
            const message = fieldName
                ? `Invalid reference: ${fieldName} does not exist`
                : "Invalid reference - related record not found";
            resolved = {
                statusCode: 400,
                message,
                errorName: err.name,
                stack: err.stack,
            };
        }

        rawLogMessage = err.message;
    } else if (err instanceof Prisma.PrismaClientValidationError) {
        resolved = {
            statusCode: 400,
            message: "Invalid data provided",
            errorName: err.name,
            stack: err.stack,
        };
        rawLogMessage = err.message;
    } else if (err instanceof Prisma.PrismaClientInitializationError) {
        resolved = {
            statusCode: 500,
            message: "Database connection error",
            errorName: err.name,
            stack: err.stack,
        };
        rawLogMessage = err.message;
    } else if (err instanceof Prisma.PrismaClientRustPanicError) {
        resolved = {
            statusCode: 500,
            message: "Database error occurred",
            errorName: err.name,
            stack: err.stack,
        };
        rawLogMessage = err.message;
    } else if (err && typeof err === "object" && "code" in err) {
        // Handle Multer errors
        const multerError = err as { code: string; field?: string; message?: string };
        
            if (multerError.code === "LIMIT_FILE_SIZE") {
            const maxSizeByField: Record<string, string> = {
                files: "2MB", // chat attachments
                file: "2MB", // knowledge PDFs
                avatar: "5MB",
                logo: "5MB",
            };
            const maxSize = multerError.field ? (maxSizeByField[multerError.field] || "2MB") : "2MB";
            resolved = {
                statusCode: 400,
                message: `File size exceeds the maximum limit of ${maxSize}. Please choose a smaller file.`,
                errorName: "MulterError",
                stack: err instanceof Error ? err.stack : undefined,
            };
        } else if (multerError.code === "LIMIT_FILE_COUNT") {
            resolved = {
                statusCode: 400,
                message: "Too many files uploaded. Please upload fewer files.",
                errorName: "MulterError",
                stack: err instanceof Error ? err.stack : undefined,
            };
        } else if (multerError.code === "LIMIT_UNEXPECTED_FILE") {
            resolved = {
                statusCode: 400,
                message: "Unexpected file field. Please check your upload form.",
                errorName: "MulterError",
                stack: err instanceof Error ? err.stack : undefined,
            };
        } else {
            resolved = {
                statusCode: 400,
                message: multerError.message || "File upload error occurred",
                errorName: "MulterError",
                stack: err instanceof Error ? err.stack : undefined,
            };
        }
        rawLogMessage = multerError.message || "Multer error";
    } else {
        resolved = {
            statusCode: 500,
            message:
                isProduction || err instanceof Error
                    ? INTERNAL_SERVER_ERROR_MESSAGE
                    : String(err),
            errorName: err instanceof Error ? err.name : "NonErrorThrown",
            stack: err instanceof Error ? err.stack : undefined,
        };

        if (!isProduction && err instanceof Error) {
            resolved.message = err.message;
        }
    }

    logServerError(req, resolved, rawLogMessage);

    return errorResponse(res, {
        statusCode: resolved.statusCode,
        message: resolved.message,
        errors: resolved.errors,
    });
}

