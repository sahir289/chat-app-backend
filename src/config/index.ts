import "dotenv/config";
import { serverConfig } from "./serverConfig";
import { corsConfig, isOriginAllowed, getAllowedOrigins } from "./corsConfig";
import { databaseConfig } from "./databaseConfig";
import { jwtConfig } from "./jwtConfig";
import { encryptionConfig } from "./encryptionConfig";
import { openaiConfig } from "./openaiConfig";
import { awsConfig } from "./awsConfig";
import { emailConfig } from "./emailConfig";
import { urlsConfig } from "./urlsConfig";
import { socketConfig } from "./socketConfig";
import { expressConfig } from "./expressConfig";
import { authConfig } from "./authConfig";
// import { kylasConfig } from "./kylasConfig";
import { analyticsConfig } from "./analyticsConfig";
import { getModuleLogger } from "../utils/logger";

const log = getModuleLogger("config");

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined) {
        return fallback;
    }
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return fallback;
}

const redisRequired = parseBoolean(process.env.REDIS_REQUIRED, true);

export const config = {
    server: serverConfig,
    cors: corsConfig,
    express: expressConfig,
    database: databaseConfig,
    jwt: jwtConfig,
    encryption: encryptionConfig,
    openai: openaiConfig,
    aws: awsConfig,
    email: emailConfig,
    urls: urlsConfig,
    socket: socketConfig,
    auth: authConfig,
    // kylas: kylasConfig,
    analytics: analyticsConfig,
    redis: {
        required: redisRequired,
    },
} as const;

export function validateConfig(): void {
    const errors: string[] = [];
    const redisUrl = process.env.REDIS_URL || "";
    const redisAllowInsecure = process.env.REDIS_ALLOW_INSECURE === "true";
    const redisAllowNoAuth = process.env.REDIS_ALLOW_NOAUTH === "true";

    if (serverConfig.isProduction) {
        if (corsConfig.origins.length === 0) {
            errors.push("CORS_ORIGINS must be set in production (comma-separated list of allowed origins)");
        }

        if (!databaseConfig.url) {
            errors.push("DATABASE_URL must be set");
        }

        if (!jwtConfig.accessSecret || !jwtConfig.refreshSecret) {
            errors.push("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set (must be different, unique secrets)");
        }

        // Validate JWT secrets are different
        if (jwtConfig.accessSecret && jwtConfig.refreshSecret && jwtConfig.accessSecret === jwtConfig.refreshSecret) {
            errors.push("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different");
        }

        // if (!encryptionConfig.key) {
        //     errors.push("ENCRYPTION_KEY must be set in production (must be different from JWT secrets)");
        // }

        // Validate encryption key is different from JWT secrets
        // if (encryptionConfig.key && jwtConfig.accessSecret && encryptionConfig.key === jwtConfig.accessSecret) {
        //     errors.push("ENCRYPTION_KEY must be different from JWT_ACCESS_SECRET");
        // }
        // if (encryptionConfig.key && jwtConfig.refreshSecret && encryptionConfig.key === jwtConfig.refreshSecret) {
        //     errors.push("ENCRYPTION_KEY must be different from JWT_REFRESH_SECRET");
        // }

        // Validate secret strength (minimum 32 characters recommended)
        if (jwtConfig.accessSecret && jwtConfig.accessSecret.length < 32) {
            errors.push("JWT_ACCESS_SECRET should be at least 32 characters long for security");
        }
        if (jwtConfig.refreshSecret && jwtConfig.refreshSecret.length < 32) {
            errors.push("JWT_REFRESH_SECRET should be at least 32 characters long for security");
        }
        // if (encryptionConfig.key && encryptionConfig.key.length < 32) {
        //     errors.push("ENCRYPTION_KEY should be at least 32 characters long for security");
        // }

        if (!urlsConfig.appUrl) {
            errors.push(
                "APP_URL (or NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_FRONTEND_URL) must be set in production (emails, invites, widget)"
            );
        }
        if (!urlsConfig.widgetEmbedUrl) {
            errors.push("Set APP_URL so the widget can use APP_URL/embed, or set WIDGET_EMBED_URL explicitly");
        }

        // if (kylasConfig.accountLeadSyncEnabled && !kylasConfig.apiKey.trim()) {
        //     errors.push(
        //         "KYLAS_API_KEY must be set in production when account lead sync is enabled (copy KYLAS_* vars from .env.example)"
        //     );
        // }

        if (!redisUrl && redisRequired) {
            errors.push("REDIS_URL must be set in production when REDIS_REQUIRED=true");
        } else if (redisUrl) {
            try {
                const parsedRedisUrl = new URL(redisUrl);

                if (!redisAllowInsecure && parsedRedisUrl.protocol !== "rediss:") {
                    errors.push("REDIS_URL must use rediss:// in production (or set REDIS_ALLOW_INSECURE=true only in private networks)");
                }

                if (!redisAllowNoAuth && !parsedRedisUrl.password) {
                    errors.push("REDIS_URL must include password in production (or set REDIS_ALLOW_NOAUTH=true only in private networks)");
                }

                if (["localhost", "127.0.0.1", "::1"].includes(parsedRedisUrl.hostname)) {
                    errors.push("REDIS_URL cannot point to localhost in production");
                }
            } catch {
                errors.push("REDIS_URL must be a valid URL");
            }
        }
    }

    if (!databaseConfig.url && serverConfig.nodeEnv !== "test") {
        log.warn("[config] DATABASE_URL is not set");
    }

    if (errors.length > 0) {
        throw new Error(`Configuration errors:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
    }
}

export { isOriginAllowed, getAllowedOrigins };

export {
    serverConfig,
    corsConfig,
    expressConfig,
    databaseConfig,
    jwtConfig,
    encryptionConfig,
    openaiConfig,
    awsConfig,
    emailConfig,
    urlsConfig,
    socketConfig,
    authConfig,
    // kylasConfig,
    analyticsConfig,
};
