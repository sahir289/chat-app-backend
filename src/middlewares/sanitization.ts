import { Request, Response, NextFunction } from "express";
import xss from "xss";
import { getModuleLogger } from "../utils/logger";

const log = getModuleLogger("sanitization");

// Define allowed value types
type Sanitizable =
    | string
    | number
    | boolean
    | null
    | undefined
    | Sanitizable[]
    | { [key: string]: Sanitizable };

// Recursively sanitize an object to prevent XSS
const sanitize = (obj: Sanitizable): Sanitizable => {
    if (typeof obj === "string") {
        return xss(obj);
    }

    if (Array.isArray(obj)) {
        return obj.map((item) => sanitize(item));
    }

    if (obj && typeof obj === "object") {
        const clone: { [key: string]: Sanitizable } = {};

        for (const key in obj) {
            try {
                clone[key] = sanitize(obj[key]);
            } catch (error) {
                log.error(`Error sanitizing key "${key}"`, error);
                clone[key] = obj[key];
            }
        }

        return clone;
    }

    return obj;
};

// XSS Sanitizer Middleware
export const xssSanitizer = (req: Request, res: Response, next: NextFunction): void => {
    if (req.body) req.body = sanitize(req.body) as any;
    if (req.query) req.query = sanitize(req.query) as any;
    if (req.params) req.params = sanitize(req.params) as any;

    next();
};