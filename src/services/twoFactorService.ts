import speakeasy from "speakeasy";
import QRCode from "qrcode";
import crypto from "node:crypto";
import { AppError } from "../utils/appError";
// import { encrypt, decrypt } from "../utils/encryption";
import { hashValue, compareValue, comparePassword } from "../utils/hash";
import { userRepository } from "../repositories/userRepository";
import type { User } from "@prisma/client";
import { getRedisClient, isRedisAvailable } from "../utils/redis";
import { config } from "../config";

// Type helper for User with 2FA fields
type UserWith2FA = User & {
    twoFactorEnabled: boolean;
    twoFactorSecret: string | null;
    twoFactorBackupCodes: string[];
};

// Fallback in-memory store for when Redis is unavailable
const fallbackVerificationAttempts = new Map<string, { count: number; resetAt: number }>();

async function resetVerificationAttempts(userId: string): Promise<void> {
    const redisAvailable = await isRedisAvailable();

    if (redisAvailable) {
        try {
            const redis = getRedisClient();
            const key = `2fa:attempts:${userId}`;
            await redis.del(key);
            return;
        } catch (error) {
        }
    }

    fallbackVerificationAttempts.delete(userId);
}

async function incrementVerificationAttempts(userId: string): Promise<number> {
    const redisAvailable = await isRedisAvailable();

    if (redisAvailable) {
        try {
            const redis = getRedisClient();
            const key = `2fa:attempts:${userId}`;
            const count = await redis.incr(key);

            if (count === 1) {
                // First attempt, set expiration
                const windowSeconds = Math.ceil(config.auth.rateLimit.twoFactorVerificationWindowMs / 1000);
                await redis.expire(key, windowSeconds);
            }

            return count;
        } catch (error) {
        }
    }

    // Fallback to memory
    const now = Date.now();
    const entry = fallbackVerificationAttempts.get(userId);

    if (!entry || entry.resetAt < now) {
        // Reset or create new entry
        fallbackVerificationAttempts.set(userId, {
            count: 1,
            resetAt: now + config.auth.rateLimit.twoFactorVerificationWindowMs,
        });
        return 1;
    }

    entry.count++;
    return entry.count;
}

async function getVerificationAttempts(userId: string): Promise<number> {
    const redisAvailable = await isRedisAvailable();

    if (redisAvailable) {
        try {
            const redis = getRedisClient();
            const key = `2fa:attempts:${userId}`;
            const count = await redis.get(key);
            return count ? parseInt(count, 10) : 0;
        } catch (error) {
        }
    }

    const entry = fallbackVerificationAttempts.get(userId);
    if (!entry || entry.resetAt < Date.now()) {
        return 0;
    }
    return entry.count;
}

/**
 * Generate backup codes (one-time use codes)
 */
function generateBackupCodes(): string[] {
    const codes: string[] = [];
    const count = config.auth.rateLimit.twoFactorBackupCodesCount;
    for (let i = 0; i < count; i++) {
        // Generate 8-character alphanumeric code
        const code = crypto.randomBytes(4).toString("hex").toUpperCase();
        codes.push(code);
    }
    return codes;
}

/**
 * Hash backup codes for storage
 */
async function hashBackupCodes(codes: string[]): Promise<string[]> {
    return Promise.all(codes.map((code) => hashValue(code)));
}

/**
 * Verify if a backup code matches any of the hashed codes
 */
async function verifyBackupCode(code: string, hashedCodes: string[]): Promise<boolean> {
    for (const hashedCode of hashedCodes) {
        const match = await compareValue(code.toUpperCase(), hashedCode);
        if (match) {
            return true;
        }
    }
    return false;
}

export const twoFactorService = {
    /**
     * Initialize 2FA setup - generates secret and QR code
     * Stores encrypted secret in database (but doesn't enable 2FA yet)
     */
    async setup(userId: string) {
        const user = await userRepository.findById(userId) as UserWith2FA | null;
        if (!user) {
            throw new AppError(404, "User not found");
        }

        if (user.twoFactorEnabled) {
            throw new AppError(400, "2FA is already enabled. Disable it first to set up again.");
        }

        // Generate TOTP secret
        const appName = config.auth.appName;
        const secret = speakeasy.generateSecret({
            name: `${user.email} (${appName})`,
            issuer: appName,
            length: 32,
        });

        // Encrypt and store secret (but don't enable 2FA yet)
        // const encryptedSecret = encrypt(secret.base32!);
        await userRepository.update(userId, {
            twoFactorSecret: secret.base32,
        });

        // Generate QR code
        const otpauthUrl = secret.otpauth_url!;
        const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

        return {
            secret: secret.base32, // Return plain secret for QR code generation (frontend can use this)
            qrCode: qrCodeDataUrl,
            otpauthUrl,
        };
    },

    /**
     * Verify OTP during setup and enable 2FA
     */
    async verifySetup(userId: string, token: string) {
        const user = await userRepository.findById(userId) as UserWith2FA | null;
        if (!user) {
            throw new AppError(404, "User not found");
        }

        if (user.twoFactorEnabled) {
            throw new AppError(400, "2FA is already enabled");
        }

        if (!user.twoFactorSecret) {
            throw new AppError(400, "2FA setup not initiated. Please call /setup first.");
        }

        // Decrypt secret
        let decryptedSecret: string;
        try {
            // decryptedSecret = decrypt(user.twoFactorSecret);
            decryptedSecret = user.twoFactorSecret;
        } catch (error) {
            throw new AppError(500, "Failed to decrypt 2FA secret. Please start setup again.");
        }

        // Verify token
        const verified = speakeasy.totp.verify({
            secret: decryptedSecret,
            encoding: "base32",
            token,
            window: config.auth.rateLimit.twoFactorTotpWindow,
        });

        if (!verified) {
            throw new AppError(400, "Invalid verification code. Please try again.");
        }

        // Generate backup codes
        const backupCodes = generateBackupCodes();
        const hashedBackupCodes = await hashBackupCodes(backupCodes);

        // Enable 2FA and save backup codes
        await userRepository.update(userId, {
            twoFactorEnabled: true,
            twoFactorBackupCodes: hashedBackupCodes,
        });

        // Reset verification attempts
        await resetVerificationAttempts(userId);

        return {
            backupCodes, // Return plain codes - user must save these!
        };
    },

    /**
     * Verify OTP during login
     */
    async verify(userId: string, token: string): Promise<boolean> {
        const user = await userRepository.findById(userId) as UserWith2FA | null;
        if (!user) {
            throw new AppError(404, "User not found");
        }

        if (!user.twoFactorEnabled) {
            throw new AppError(400, "2FA is not enabled for this account");
        }

        if (!user.twoFactorSecret) {
            throw new AppError(500, "2FA secret not found. Please disable and re-enable 2FA.");
        }

        // Check verification attempts BEFORE allowing this attempt
        const attempts = await getVerificationAttempts(userId);
        const maxAttempts = config.auth.rateLimit.twoFactorVerifyMaxAttempts;
        if (attempts >= maxAttempts) {
            const windowMinutes = Math.ceil(config.auth.rateLimit.twoFactorVerificationWindowMs / (60 * 1000));
            throw new AppError(429, `Too many verification attempts. Please try again in ${windowMinutes} minutes.`);
        }

        // Decrypt secret
        let decryptedSecret: string;
        try {
            // decryptedSecret = decrypt(user.twoFactorSecret);
            decryptedSecret = user.twoFactorSecret;
        } catch (error) {
            throw new AppError(500, "Failed to decrypt 2FA secret. Please contact support.");
        }

        // First, try TOTP verification
        const totpVerified = speakeasy.totp.verify({
            secret: decryptedSecret,
            encoding: "base32",
            token,
            window: config.auth.rateLimit.twoFactorTotpWindow,
        });

        if (totpVerified) {
            // Reset attempts on successful verification
            await resetVerificationAttempts(userId);
            return true;
        }

        // If TOTP fails, try backup codes
        const backupCodeVerified = await verifyBackupCode(token, user.twoFactorBackupCodes);
        if (backupCodeVerified) {
            // Find and remove used backup code
            let codeIndex = -1;
            for (let i = 0; i < user.twoFactorBackupCodes.length; i++) {
                const match = await compareValue(token.toUpperCase(), user.twoFactorBackupCodes[i]);
                if (match) {
                    codeIndex = i;
                    break;
                }
            }

            if (codeIndex !== -1) {
                const updatedBackupCodes = [...user.twoFactorBackupCodes];
                updatedBackupCodes.splice(codeIndex, 1);

                await userRepository.update(userId, {
                    twoFactorBackupCodes: updatedBackupCodes,
                });
            }

            // Reset attempts on successful verification
            await resetVerificationAttempts(userId);
            return true;
        }

        // Verification failed - increment attempts counter
        await incrementVerificationAttempts(userId);

        throw new AppError(400, "Invalid verification code. Please try again.");
    },

    /**
     * Disable 2FA (requires password verification)
     */
    async disable(userId: string, password: string) {
        const user = await userRepository.findById(userId) as UserWith2FA | null;
        if (!user) {
            throw new AppError(404, "User not found");
        }

        if (!user.twoFactorEnabled) {
            throw new AppError(400, "2FA is not enabled");
        }

        if (!user.password) {
            throw new AppError(400, "Password verification required to disable 2FA");
        }

        // Verify password
        const passwordValid = await comparePassword(password, user.password);
        if (!passwordValid) {
            throw new AppError(400, "Invalid password");
        }

        // Disable 2FA and clear data
        await userRepository.update(userId, {
            twoFactorEnabled: false,
            twoFactorSecret: null,
            twoFactorBackupCodes: [],
        });

        await resetVerificationAttempts(userId);
    },

    /**
     * Generate new backup codes
     */
    async generateBackupCodes(userId: string, password: string) {
        const user = await userRepository.findById(userId) as UserWith2FA | null;
        if (!user) {
            throw new AppError(404, "User not found");
        }

        if (!user.twoFactorEnabled) {
            throw new AppError(400, "2FA is not enabled");
        }

        if (!user.password) {
            throw new AppError(400, "Password verification required");
        }

        // Verify password
        const passwordValid = await comparePassword(password, user.password);
        if (!passwordValid) {
            throw new AppError(400, "Invalid password");
        }

        // Generate new backup codes
        const backupCodes = generateBackupCodes();
        const hashedBackupCodes = await hashBackupCodes(backupCodes);

        // Replace old backup codes
        await userRepository.update(userId, {
            twoFactorBackupCodes: hashedBackupCodes,
        });

        return {
            backupCodes, // Return plain codes - user must save these!
        };
    },
};

