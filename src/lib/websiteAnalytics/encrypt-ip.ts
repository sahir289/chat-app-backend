import {
    createCipheriv,
    createDecipheriv,
    createHash,
    randomBytes,
} from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export class IpEncryptionConfigError extends Error {
    constructor() {
        super("IP_ENCRYPTION_KEY environment variable is not set");
        this.name = "IpEncryptionConfigError";
    }
}

function getEncryptionKey(): Buffer {
    const secret = process.env.IP_ENCRYPTION_KEY;

    if (!secret) {
        throw new IpEncryptionConfigError();
    }

    return createHash("sha256").update(secret).digest();
}

export function encryptIp(ip: string): string {
    const key = getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(ip, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptIp(encryptedValue: string): string {
    const key = getEncryptionKey();
    const parts = encryptedValue.split(":");

    if (parts.length !== 3) {
        throw new Error("Invalid encrypted IP format");
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    return decrypted.toString("utf8");
}

export function decryptVisitorIp(encryptedIp: string): string {
    return decryptIp(encryptedIp);
}
