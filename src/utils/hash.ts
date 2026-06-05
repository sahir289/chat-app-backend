import bcrypt from "bcryptjs";
import crypto from "crypto";

const SALT_ROUNDS = 10;

export async function hashValue(value: string): Promise<string> {
  return bcrypt.hash(value, SALT_ROUNDS);
}

export async function compareValue(value: string, hashed: string | null | undefined): Promise<boolean> {
  if (!hashed) return false;
  return bcrypt.compare(value, hashed);
}

export const hashPassword = hashValue;
export const comparePassword = compareValue;
export const hashToken = hashValue;
export const compareToken = compareValue;

// SHA-256 hashing for invite tokens (deterministic, allows direct database lookup)
export function hashInviteToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function hashVerificationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function hashPasswordResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
