import { serverConfig } from "./serverConfig";
import { urlsConfig } from "./urlsConfig";

function parsePositiveInt(value: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function applyProductionCap(value: number, cap: number): number {
    return serverConfig.isProduction ? Math.min(value, cap) : value;
}

const authRateLimitWindowMs = parsePositiveInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 900000);
const loginMaxAttempts = parsePositiveInt(process.env.LOGIN_MAX_ATTEMPTS, 10);
const login2FAMaxAttempts = parsePositiveInt(process.env.LOGIN_2FA_MAX_ATTEMPTS, 10);
const registerMaxAttempts = parsePositiveInt(process.env.REGISTER_MAX_ATTEMPTS, 5);

const forgotPasswordMaxAttempts = Math.min(
    parsePositiveInt(process.env.FORGOT_PASSWORD_MAX_ATTEMPTS ?? process.env.PASSWORD_RESET_MAX_ATTEMPTS, 2),
    2
);

const resetPasswordMaxAttempts = Math.min(
    parsePositiveInt(process.env.RESET_PASSWORD_MAX_ATTEMPTS, 5),
    5
);

const emailResendMaxAttempts = parsePositiveInt(process.env.EMAIL_RESEND_MAX_ATTEMPTS, 2);
const twoFactorVerificationMaxAttempts = parsePositiveInt(process.env.TWO_FA_VERIFICATION_MAX_ATTEMPTS, 10);
const twoFactorVerifyMaxAttempts = parsePositiveInt(process.env.TWO_FA_VERIFY_MAX_ATTEMPTS, 5);
const twoFactorTotpWindow = parsePositiveInt(process.env.TWO_FA_TOTP_WINDOW, 1);
const twoFactorBackupCodesCount = parsePositiveInt(process.env.TWO_FA_BACKUP_CODES_COUNT, 10);
const refreshCookieMaxAgeMs = parsePositiveInt(process.env.REFRESH_COOKIE_MAX_AGE_MS, 30 * 24 * 60 * 60 * 1000);
const accessTokenMaxAgeMs = parsePositiveInt(process.env.ACCESS_TOKEN_MAX_AGE_MS, 60 * 60 * 1000);

const refreshTokenWindowMs = parsePositiveInt(process.env.REFRESH_TOKEN_WINDOW_MS, 5 * 60 * 1000);
const refreshTokenMaxAttempts = parsePositiveInt(process.env.REFRESH_TOKEN_MAX_ATTEMPTS, 60);
const verifyEmailWindowMs = parsePositiveInt(process.env.VERIFY_EMAIL_WINDOW_MS, 1 * 60 * 1000);
const verifyEmailMaxAttempts = parsePositiveInt(process.env.VERIFY_EMAIL_MAX_ATTEMPTS, 30);
const acceptInviteWindowMs = parsePositiveInt(process.env.ACCEPT_INVITE_WINDOW_MS, 10 * 60 * 1000);
const acceptInviteMaxAttempts = parsePositiveInt(process.env.ACCEPT_INVITE_MAX_ATTEMPTS, 10);
const validateInviteWindowMs = parsePositiveInt(process.env.VALIDATE_INVITE_WINDOW_MS, 1 * 60 * 1000);
const validateInviteMaxAttempts = parsePositiveInt(process.env.VALIDATE_INVITE_MAX_ATTEMPTS, 30);

export const authConfig = {
    accessTokenMaxAgeMs,
    appName: process.env.APP_NAME || "Chatbot",
    inviteBaseUrl: urlsConfig.inviteBaseUrl,
    refreshCookieMaxAgeMs,
    rateLimit: {
        authWindowMs: authRateLimitWindowMs,
        loginMaxAttempts: applyProductionCap(loginMaxAttempts, 10),
        login2FAMaxAttempts: applyProductionCap(login2FAMaxAttempts, 10),
        registerMaxAttempts: applyProductionCap(registerMaxAttempts, 5),
        forgotPasswordMaxAttempts: applyProductionCap(forgotPasswordMaxAttempts, 2),
        resetPasswordMaxAttempts: applyProductionCap(resetPasswordMaxAttempts, 5),
        emailResendMaxAttempts: applyProductionCap(emailResendMaxAttempts, 2),
        twoFactorVerificationMaxAttempts: applyProductionCap(twoFactorVerificationMaxAttempts, 3),
        twoFactorVerificationWindowMs: authRateLimitWindowMs,
        twoFactorWindowMs: 15 * 60 * 1000,
        twoFactorMaxAttempts: 10,
        twoFactorVerifyMaxAttempts: applyProductionCap(twoFactorVerifyMaxAttempts, 5),
        twoFactorTotpWindow,
        twoFactorBackupCodesCount,
        refreshTokenWindowMs,
        refreshTokenMaxAttempts: applyProductionCap(refreshTokenMaxAttempts, 60),
        verifyEmailWindowMs,
        verifyEmailMaxAttempts: applyProductionCap(verifyEmailMaxAttempts, 30),
        acceptInviteWindowMs,
        acceptInviteMaxAttempts: applyProductionCap(acceptInviteMaxAttempts, 10),
        validateInviteWindowMs,
        validateInviteMaxAttempts: applyProductionCap(validateInviteMaxAttempts, 30),
    },
} as const;
