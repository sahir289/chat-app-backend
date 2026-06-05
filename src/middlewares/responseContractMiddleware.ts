import { NextFunction, Request, Response } from "express";

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasFlag(value: unknown): value is boolean {
    return typeof value === "boolean";
}

function hasText(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function isStandardizedResponse(body: JsonObject, hasSuccess: boolean, hasOk: boolean, hasError: boolean): boolean {
    return hasSuccess && !hasOk && !hasError && "timestamp" in body;
}

export function responseContractMiddleware(_req: Request, res: Response, next: NextFunction) {
    const originalJson = res.json.bind(res);

    res.json = ((body: unknown) => {
        if (!isJsonObject(body)) {
            return originalJson(body);
        }

        const hasOk = hasFlag(body.ok);
        const hasSuccess = hasFlag(body.success);
        const hasError = hasText(body.error);
        const hasMessage = hasText(body.message);

        if (!hasOk && !hasSuccess && !hasError && !hasMessage) {
            return originalJson(body);
        }

        // Keep standardized helper responses untouched (success/message/timestamp).
        if (isStandardizedResponse(body, hasSuccess, hasOk, hasError)) {
            return originalJson(body);
        }

        const normalized: JsonObject = { ...body };
        const normalizedOk =
            hasOk ? Boolean(body.ok) : hasSuccess ? Boolean(body.success) : res.statusCode < 400;

        normalized.ok = normalizedOk;
        normalized.success = normalizedOk;

        if (normalizedOk) {
            if (!hasMessage) {
                normalized.message = "Success";
            }
        } else {
            if (res.statusCode < 400) {
                res.status(400);
            }

            const normalizedMessage = hasMessage
                ? String(body.message)
                : hasError
                    ? String(body.error)
                    : "Request failed";

            normalized.message = normalizedMessage;
            normalized.error = normalizedMessage;
        }

        if (!("timestamp" in normalized)) {
            normalized.timestamp = new Date().toISOString();
        }

        return originalJson(normalized);
    }) as Response["json"];

    return next();
}
