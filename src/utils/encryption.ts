import crypto from "node:crypto";
import { AppError } from "./appError";
import { config } from "../config";
import { getModuleLogger } from "./logger";

const log = getModuleLogger("encryption");

const ENCRYPTION_KEY = config.encryption.key;
const ALGORITHM = config.encryption.algorithm;
const IV_LENGTH = config.encryption.ivLength;
const SALT_LENGTH = config.encryption.saltLength;
const TAG_LENGTH = config.encryption.tagLength;

if (!ENCRYPTION_KEY) {
    log.warn("ENCRYPTION_KEY is not set. 2FA encryption will not work.");
}

/**
 * Derives a 32-byte key from the encryption key using PBKDF2
 */
function deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256");
}

/**
 * Encrypts a value using AES-256-GCM
 * Returns a base64-encoded string containing: salt + iv + encrypted data + auth tag
 */
export function encrypt(value: string): string {
    if (!ENCRYPTION_KEY) {
        throw new AppError(500, "Encryption key not configured");
    }

    if (!value) {
        throw new AppError(400, "Value to encrypt cannot be empty");
    }

    try {
        // Generate random salt and IV
        const salt = crypto.randomBytes(SALT_LENGTH);
        const iv = crypto.randomBytes(IV_LENGTH);

        // Derive key from password and salt
        const key = deriveKey(ENCRYPTION_KEY, salt);

        // Create cipher
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        // Encrypt
        let encrypted = cipher.update(value, "utf8");
        encrypted = Buffer.concat([encrypted, cipher.final()]);

        // Get authentication tag
        const tag = cipher.getAuthTag();

        // Combine: salt + iv + tag + encrypted data
        const combined = Buffer.concat([salt, iv, tag, encrypted]);

        // Return as base64
        return combined.toString("base64");
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Never log the value being encrypted or the encryption key
        log.error(`Encryption failed: ${errorMessage}`);
        throw new AppError(500, `Encryption failed: ${errorMessage}`);
    }
}

/**
 * Decrypts a value encrypted with encrypt()
 */
export function decrypt(encryptedValue: string): string {
    if (!ENCRYPTION_KEY) {
        throw new AppError(500, "Encryption key not configured");
    }

    if (!encryptedValue) {
        throw new AppError(400, "Encrypted value cannot be empty");
    }

    try {
        // Decode from base64
        const combined = Buffer.from(encryptedValue, "base64");

        // Extract components
        const salt = combined.subarray(0, SALT_LENGTH);
        const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
        const tag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
        const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

        // Derive key from password and salt
        const key = deriveKey(ENCRYPTION_KEY, salt);

        // Create decipher
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);

        // Decrypt
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        return decrypted.toString("utf8");
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Never log the encrypted value or the decrypted result
        log.error(`Decryption failed: ${errorMessage}`);
        throw new AppError(500, `Decryption failed: ${errorMessage}`);
    }
}

