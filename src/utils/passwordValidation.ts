export interface PasswordValidationResult {
    isValid: boolean;
    errors: string[];
}

export function validatePasswordStrength(password: string): PasswordValidationResult {
    const errors: string[] = [];

    if (!password || typeof password !== "string") {
        return { isValid: false, errors: ["Password is required"] };
    }

    // Check for at least one letter
    if (!/[a-zA-Z]/.test(password)) {
        errors.push("Password must contain at least one letter");
    }

    // Check for at least one number or special character
    if (!/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        errors.push("Password must contain at least one number or special character");
    }

    // Check for common weak passwords (optional - can be expanded)
    const commonPasswords = ["password", "12345678", "qwerty", "abc123"];
    if (commonPasswords.some(weak => password.toLowerCase().includes(weak))) {
        errors.push("Password is too common. Please choose a stronger password");
    }

    return {
        isValid: errors.length === 0,
        errors,
    };
}

/**
 * Validates password and throws AppError if invalid
 */
export function validatePasswordOrThrow(password: string): void {
    const result = validatePasswordStrength(password);
    if (!result.isValid) {
        const { AppError } = require("./appError");
        throw new AppError(400, result.errors.join(". "));
    }
}

