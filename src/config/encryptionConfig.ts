export const encryptionConfig = {
    key: process.env.ENCRYPTION_KEY || "",
    algorithm: "aes-256-gcm",
    ivLength: 16,
    saltLength: 64,
    tagLength: 16,
} as const;

