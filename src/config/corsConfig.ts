import { getModuleLogger } from "../utils/logger";

const log = getModuleLogger("config");

const isDev = process.env.NODE_ENV === "development";

export const corsConfig = {
    origins: (process.env.CORS_ORIGINS || "")
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    credentials: true,
    allowLocalhostInDev: true,
} as const;

export function isOriginAllowed(origin: string | undefined): boolean {
    if (!origin) {
        return true;
    }


    // Allow localhost ONLY in development
    if (
        isDev &&
        corsConfig.allowLocalhostInDev &&
        (
            origin.startsWith("http://localhost:") ||
            origin.startsWith("http://127.0.0.1:")
        )
    ) {
        return true;
    }

    // Check if origin matches any of the allowed origins
    const isAllowed = corsConfig.origins.includes(origin);

    // Log blocked origins
    if (!isAllowed) {
        const allowedOrigins = corsConfig.origins.join(", ") || "none (CORS_ORIGINS not set)";
        if (isDev) {
            log.debug(`[CORS] Blocked origin: ${origin}. Allowed: ${allowedOrigins}`);
        } else {
            log.warn(`[CORS] Blocked origin: ${origin}. Allowed: ${allowedOrigins}`);
        }
    }

    return isAllowed;
}

export function getAllowedOrigins(): string[] {
    return corsConfig.origins;
}

