import { signAccessToken, signRefreshToken } from "./token";
import { hashToken } from "./hash";
import { refreshTokenRepository } from "../repositories/refreshTokenRepository";
import {
    INVITE_EXPIRY_HOURS,
    REFRESH_DAYS,
    EMAIL_VERIFICATION_EXPIRY_HOURS,
    PASSWORD_RESET_EXPIRY_HOURS,
} from "../constants/authConstants";
import { urlsConfig } from "../config/urlsConfig";

export function getInviteExpiryDate(): Date {
    const now = new Date();
    // Use milliseconds to avoid timezone issues
    const expiryTime = now.getTime() + (INVITE_EXPIRY_HOURS * 60 * 60 * 1000);
    return new Date(expiryTime);
}

export function getEmailVerificationExpiryDate(): Date {
    const now = new Date();
    // Use milliseconds to avoid timezone issues
    const expiryTime = now.getTime() + (EMAIL_VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000);
    return new Date(expiryTime);
}

export function getPasswordResetExpiryDate(): Date {
    const now = new Date();
    // Use milliseconds to avoid timezone issues
    const expiryTime = now.getTime() + (PASSWORD_RESET_EXPIRY_HOURS * 60 * 60 * 1000);
    return new Date(expiryTime);
}

export function getRefreshExpiryDate(): Date {
    const now = new Date();
    now.setDate(now.getDate() + REFRESH_DAYS);
    return now;
}

export function getFrontendBaseUrl(): string {
    return urlsConfig.frontendUrl;
}

export function isSmtpConfigured(): boolean {
    return !!(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function issueTokens(user: { id: string; companyId: string | null; role: string; isOwner: boolean }) {
    // Access token contains full authorization information
    const accessPayload = {
        userId: user.id,
        companyId: user.companyId || null,
        role: user.role,
        isOwner: user.isOwner || false
    };
    // Refresh token contains minimal information (only userId) for security
    const refreshPayload = {
        userId: user.id
    };
    const accessToken = signAccessToken(accessPayload);
    const refreshToken = signRefreshToken(refreshPayload);
    const hashed = await hashToken(refreshToken);
    const expiresAt = getRefreshExpiryDate();
    await refreshTokenRepository.deleteByUserId(user.id);
    await refreshTokenRepository.create({
        userId: user.id,
        tokenHash: hashed,
        expiresAt,
    });
    return { accessToken, refreshToken };
}

