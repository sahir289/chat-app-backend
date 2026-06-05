/**
 * JWT Configuration
 * 
 * Note: Use JWT_ACCESS_EXPIRES_IN for access tokens (short-lived, e.g., "1m")
 *       Use JWT_REFRESH_EXPIRES_IN for refresh tokens (long-lived, e.g., "30d")
 * 
 * There is no JWT_EXPIRES_IN - always specify ACCESS or REFRESH explicitly.
 */
export const jwtConfig = {
    accessSecret: process.env.JWT_ACCESS_SECRET || "",
    refreshSecret: process.env.JWT_REFRESH_SECRET || "",
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "1h",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
} as const;

 