import jwt, { SignOptions, Secret } from "jsonwebtoken";
import { AppError } from "./appError";
import crypto from "node:crypto";
import { config } from "../config";
import { TWO_FACTOR_CHALLENGE_EXPIRES_IN, TWO_FACTOR_CHALLENGE_PURPOSE } from "../constants/authConstants";
import { getModuleLogger } from "./logger";

const log = getModuleLogger("token");

const { accessSecret, refreshSecret, accessExpiresIn, refreshExpiresIn } = config.jwt;

if (!accessSecret || !refreshSecret) {
  log.warn("JWT secrets are not set. Tokens cannot be signed.");
}

type JwtPayload = {
  userId: string;
  companyId: string | null | undefined; // SUPER_ADMIN can have null companyId
  role: string;
  isOwner: boolean;
};

type RefreshTokenPayload = {
  userId: string;
};

type TwoFactorChallengePayload = {
  userId: string;
  purpose: typeof TWO_FACTOR_CHALLENGE_PURPOSE;
  jti: string;
};

function signWithSecret(payload: JwtPayload | RefreshTokenPayload | TwoFactorChallengePayload, secret: Secret, expiresIn: string) {
  if (!secret) {
    log.error("JWT secret not configured");
    throw new AppError(500, "JWT secret not configured");
  }
  try {
    const options: SignOptions = { expiresIn: expiresIn as any };
    return jwt.sign(payload as object, secret, options);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Token signing failed: ${errorMessage}`);
    throw new AppError(500, "Token signing failed");
  }
}

export function signAccessToken(payload: JwtPayload): string {
  return signWithSecret(payload, accessSecret as Secret, accessExpiresIn);
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return signWithSecret(payload, refreshSecret as Secret, refreshExpiresIn);
}

export function verifyAccessToken<T = JwtPayload>(token: string): T {
  if (!accessSecret) {
    log.error("JWT secret not configured");
    throw new AppError(500, "JWT secret not configured");
  }
  try {
    return jwt.verify(token, accessSecret) as T;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Sanitize: never log the actual token, only the error type
    log.warn(`Access token verification failed: ${errorMessage}`);
    throw new AppError(401, "Invalid or expired token");
  }
}

export function verifyRefreshToken<T = RefreshTokenPayload>(token: string): T {
  if (!refreshSecret) {
    log.error("JWT secret not configured");
    throw new AppError(500, "JWT secret not configured");
  }
  try {
    return jwt.verify(token, refreshSecret) as T;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Sanitize: never log the actual token, only the error type
    log.warn(`Refresh token verification failed: ${errorMessage}`);
    throw new AppError(401, "Invalid or expired refresh token");
  }
}

export function signTwoFactorChallenge(userId: string): string {
  return signWithSecret(
    {
      userId,
      purpose: TWO_FACTOR_CHALLENGE_PURPOSE,
      jti: crypto.randomUUID(),
    },
    accessSecret as Secret,
    TWO_FACTOR_CHALLENGE_EXPIRES_IN
  );
}

export function verifyTwoFactorChallenge(token: string): TwoFactorChallengePayload {
  const payload = verifyAccessToken<TwoFactorChallengePayload & { exp?: number }>(token);

  if (
    !payload.userId ||
    payload.purpose !== TWO_FACTOR_CHALLENGE_PURPOSE ||
    !payload.jti
  ) {
    throw new AppError(401, "Invalid or expired 2FA challenge");
  }

  return {
    userId: payload.userId,
    purpose: payload.purpose,
    jti: payload.jti,
  };
}

export type { JwtPayload, RefreshTokenPayload, TwoFactorChallengePayload };

