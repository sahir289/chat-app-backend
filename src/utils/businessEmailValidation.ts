/**
 * Business Email Validation Utility
 * 
 * Validates that an email address does not belong to free email providers.
 * Note: Email format validation should be done by the caller (e.g., Zod schema).
 * This function only checks if the email domain is from a free email provider.
 */

export interface BusinessEmailValidationResult {
    isValid: boolean;
    error: string | null;
}

/**
 * List of free email provider domains to reject
 */
const FREE_EMAIL_DOMAINS: readonly string[] = [
    'gmail.com',
    'yahoo.com',
    'outlook.com',
    'hotmail.com',
    'icloud.com',
    'protonmail.com',
    // Additional common free email providers
    'aol.com',
    'mail.com',
    'yandex.com',
    'zoho.com',
    'gmx.com',
    'proton.me',
    'live.com',
    'msn.com',
    'yahoo.co.uk',
    'yahoo.co.jp',
    'gmail.co.uk',
    'outlook.co.uk',
    'hotmail.co.uk',
    'icloud.co.uk',
];

export function validateBusinessEmail(email: string): BusinessEmailValidationResult {
    const trimmedEmail = email.trim().toLowerCase();

    // Extract domain from email
    const domain = trimmedEmail.split('@')[1];

    if (!domain) {
        return {
            isValid: false,
            error: 'Please enter a valid email address',
        };
    }

    // Check if domain is in the free email providers list
    if (FREE_EMAIL_DOMAINS.includes(domain)) {
        return {
            isValid: false,
            error: 'Please use your business email',
        };
    }

    // Email is valid and from a business domain
    return {
        isValid: true,
        error: null,
    };
}

/**
 * Checks if a domain is a free email provider
 * 
 * @param domain - The domain to check
 * @returns true if the domain is a free email provider
 */
export function isFreeEmailDomain(domain: string): boolean {
    return FREE_EMAIL_DOMAINS.includes(domain.toLowerCase());
}

