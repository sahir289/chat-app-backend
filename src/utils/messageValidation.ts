export const MESSAGE_LIMITS = {
    VISITOR_MAX_LENGTH: 250,
    AUTHENTICATED_MAX_LENGTH: 250,
} as const;

/**
 * Validates message text length based on user type
 * @param text - The message text to validate
 * @param isVisitor - Whether the sender is a visitor (anonymous/unauthenticated)
 * @returns Object with isValid flag and error message if invalid
 */
export function validateMessageLength(
    text: string,
    isVisitor: boolean
): { isValid: boolean; error?: string; maxLength: number } {
    const maxLength = isVisitor
        ? MESSAGE_LIMITS.VISITOR_MAX_LENGTH
        : MESSAGE_LIMITS.AUTHENTICATED_MAX_LENGTH;

    if (text.length > maxLength) {
        return {
            isValid: false,
            error: `Message text must not exceed ${maxLength} characters`,
            maxLength,
        };
    }

    return { isValid: true, maxLength };
}

export function isVisitorSenderType(senderType?: string): boolean {
    return senderType?.toUpperCase() === "VISITOR";
}

