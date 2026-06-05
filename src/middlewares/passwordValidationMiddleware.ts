import { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/appError";
import { validatePasswordStrength } from "../utils/passwordValidation";

/**
 * Middleware to validate password strength
 * @param fieldName - The name of the field in req.body that contains the password (default: "password")
 */
export function validatePasswordMiddleware(fieldName: string = "password") {
    return (req: Request, _res: Response, next: NextFunction) => {
        const password = req.body[fieldName];

        const validation = validatePasswordStrength(password);
        if (!validation.isValid) {
            return next(new AppError(400, validation.errors.join(". ")));
        }

        return next();
    };
}

