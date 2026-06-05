import { Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";
import { AppError } from "../utils/appError";
import type { AuthenticatedRequest } from "./authMiddleware";

function formatFieldPath(path: (string | number)[]): string {
    const filtered = path.filter(
        (segment) =>
            segment !== "body" &&
            segment !== "query" &&
            segment !== "params" &&
            segment !== "headers" &&
            segment !== "cookies"
    );
    return filtered.join(".");
}

function toLabel(fieldPath: string): string {
    if (!fieldPath) return "";
    const fieldName = fieldPath.split(".").pop() ?? fieldPath;
    const label = fieldName
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .trim();
    return label ? label[0].toUpperCase() + label.slice(1) : "";
}

function getFriendlyIssueMessage(issue: z.ZodIssue): string {
    const fieldPath = formatFieldPath(issue.path);
    const label = toLabel(fieldPath);

    if (issue.code === "invalid_type" && (issue as { received?: string }).received === "undefined" && label) {
        return `${label} is required`;
    }

    return issue.message;
}

export function validate(schema: z.ZodTypeAny) {
    return (req: Request, _res: Response, next: NextFunction) => {
        try {
            schema.parse({
                body: req.body,
                query: req.query,
                params: req.params,
                headers: req.headers,
                cookies: req.cookies,
            });
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const errors = error.issues.map((issue) => ({
                    path: formatFieldPath(issue.path),
                    message: getFriendlyIssueMessage(issue),
                }));
                // Use a generic message when there are multiple errors, otherwise use the specific error message
                const message = errors.length > 1
                    ? "Validation failed"
                    : errors[0]?.message || "Validation error";
                return next(
                    new AppError(400, message, { errors })
                );
            }
            next(error);
        }
    };
}

export function requireUserId(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
    if (!req.user?.id) {
        return next(new AppError(401, "Unauthorized"));
    }
    return next();
}

