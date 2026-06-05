import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/appError";
import { extractIPAddress } from "../utils/requestMeta";
import { consumeRateLimit } from "../helpers/rateLimit/rateLimitStore";
import { config } from "../config";
import { hashPasswordResetToken } from "../utils/hash";
import { userRepository } from "../repositories/userRepository";
import type { AuthenticatedRequest } from "./authMiddleware";

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
  message?: string;
  failClosed?: boolean;
}

const normalizeEmail = (email: unknown) =>
  typeof email === "string" ? email.toLowerCase().trim() : null;

export function rateLimit(options: RateLimitOptions) {
  const { windowMs, maxRequests, keyGenerator, message, failClosed = false } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = keyGenerator ? keyGenerator(req) : extractIPAddress(req) || "unknown";
      const now = Date.now();
      const updated = await consumeRateLimit(key, windowMs);

      if (updated.count > maxRequests) {
        const retryAfter = Math.ceil((updated.resetTime - now) / 1000);
        const errorMessage =
          message ||
          `Rate limit exceeded. Maximum ${maxRequests} requests per ${Math.floor(windowMs / 1000)} seconds.`;

        res.setHeader("Retry-After", retryAfter.toString());

        return next(new AppError(429, errorMessage));
      }

      return next();
    } catch (error) {
      if (failClosed) {
        return next(new AppError(503, "Rate limit service temporarily unavailable. Please try again."));
      }
      // On non-critical paths, allow the request to proceed (fail open)
      return next();
    }
  };
}

export const widgetIPRateLimit = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 60,
  message: "Too many requests from this IP. Please try again later.",
});

export const widgetSessionRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const sessionId = req.body?.sessionId;
  if (!sessionId || typeof sessionId !== "string") {
    return widgetIPRateLimit(req, res, next);
  }

  return rateLimit({
    windowMs: 60 * 1000,
    maxRequests: 50,
    keyGenerator: () => `session:${sessionId}`,
    message: "Too many requests from this session. Please try again later.",
  })(req, res, next);
};

export const widgetEventRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const sessionId = req.body?.sessionId;
  if (!sessionId || typeof sessionId !== "string") {
    return next(new AppError(400, "sessionId is required for rate limiting"));
  }

  return rateLimit({
    windowMs: 60 * 1000,
    maxRequests: 30,
    keyGenerator: () => `event:${sessionId}`,
    message: "Too many events from this session. Please slow down.",
  })(req, res, next);
};

export const widgetMessageRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const chatId = req.body?.chatId;
  if (!chatId || typeof chatId !== "string") {
    return widgetIPRateLimit(req, res, next);
  }

  return rateLimit({
    windowMs: 60 * 1000,
    maxRequests: 20,
    keyGenerator: () => `message:${chatId}`,
    message: "Too many messages. Please slow down.",
  })(req, res, next);
};

export const loginRateLimit = rateLimit({
  windowMs: config.auth.rateLimit.authWindowMs,
  maxRequests: config.auth.rateLimit.loginMaxAttempts,
  message: "Too many login attempts. Please try again later.",
  failClosed: true,
});

export const login2FARateLimit = (req: Request, res: Response, next: NextFunction) => {
  // Use the challenge token when available; fall back to IP for malformed requests.
  const challengeToken = req.body?.challengeToken;
  const ip = extractIPAddress(req) || "unknown";

  const key = challengeToken && typeof challengeToken === "string"
    ? `login-2fa:challenge:${challengeToken.slice(0, 32)}`
    : `login-2fa:ip:${ip}`;

  return rateLimit({
    windowMs: config.auth.rateLimit.authWindowMs,
    maxRequests: config.auth.rateLimit.login2FAMaxAttempts,
    keyGenerator: () => key,
    message: "Too many 2FA verification attempts. Please try again later.",
    failClosed: true,
  })(req, res, next);
};

export const registerIpRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const ip = extractIPAddress(req) || "unknown";

  return rateLimit({
    windowMs: config.auth.rateLimit.authWindowMs,
    maxRequests: config.auth.rateLimit.registerMaxAttempts,
    keyGenerator: () => `register:ip:${ip}`,
    message: "Too many registration attempts. Please try again later.",
    failClosed: true,
  })(req, res, next);
};

export const registerEmailRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) return next();

  return rateLimit({
    windowMs: config.auth.rateLimit.authWindowMs,
    maxRequests: config.auth.rateLimit.registerMaxAttempts,
    keyGenerator: () => `register:email:${email}`,
    message: "Too many registration attempts. Please try again later.",
    failClosed: true,
  })(req, res, next);
};

export const forgotPasswordRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const email = req.body?.email;
  const ip = extractIPAddress(req) || "unknown";

  const key = email && typeof email === "string"
    ? `forgot-password:${email.toLowerCase()}:${ip}`
    : `forgot-password:${ip}`;

  return rateLimit({
    windowMs: config.auth.rateLimit.authWindowMs,
    maxRequests: config.auth.rateLimit.forgotPasswordMaxAttempts,
    keyGenerator: () => key,
    message: "Too many password reset requests. Please try again later.",
    failClosed: true,
  })(req, res, next);
};

export const resetPasswordRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const token = req.body?.token;
  const ip = extractIPAddress(req) || "unknown";

  // Rate limit by IP and optionally by token hash (to prevent brute force on specific tokens)
  // If token is provided, hash it for the key (prevents token enumeration but allows per-token limiting)
  let key = `reset-password:${ip}`;
  if (token && typeof token === "string") {
    try {
      const normalizedToken = decodeURIComponent(token);
      const tokenHash = hashPasswordResetToken(normalizedToken);
      // Use first 16 chars of hash for rate limiting key (prevents token enumeration)
      key = `reset-password:${tokenHash.substring(0, 16)}:${ip}`;
    } catch {
      // If hashing fails, fall back to IP-only rate limiting
      key = `reset-password:${ip}`;
    }
  }

  return rateLimit({
    windowMs: config.auth.rateLimit.authWindowMs,
    maxRequests: config.auth.rateLimit.resetPasswordMaxAttempts,
    keyGenerator: () => key,
    message: "Too many password reset attempts. Please try again later.",
    failClosed: true,
  })(req, res, next);
};

export const resendVerificationRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const email = req.body?.email;
  const ip = extractIPAddress(req) || "unknown";

  const key = email && typeof email === "string"
    ? `resend-verification:${email.toLowerCase()}:${ip}`
    : `resend-verification:${ip}`;

  return rateLimit({
    windowMs: config.auth.rateLimit.authWindowMs,
    maxRequests: config.auth.rateLimit.emailResendMaxAttempts,
    keyGenerator: () => key,
    message: "Too many verification email requests. Please try again later.",
    failClosed: true,
  })(req, res, next);
};

// then applies rate limiting before the request reaches the controller
export const loginUnverifiedEmailRateLimit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = req.body?.email;

    // If no email in body, skip this rate limit check (will be handled by loginRateLimit)
    if (!email || typeof email !== "string") {
      return next();
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user exists and email is not verified
    const user = await userRepository.findByEmail(normalizedEmail);

    // Only apply rate limiting if user exists and email is not verified
    if (!user || user.emailVerified) {
      return next();
    }

    // Use email as key for rate limiting (matches service layer behavior)
    // Note: Service layer doesn't have access to IP, so we use email only
    // This matches the middleware behavior when IP is unavailable
    const rateLimitKey = `resend-verification:${normalizedEmail}`;
    const now = Date.now();
    const updated = await consumeRateLimit(rateLimitKey, config.auth.rateLimit.authWindowMs);

    if (updated.count > config.auth.rateLimit.emailResendMaxAttempts) {
      const retryAfter = Math.ceil((updated.resetTime - now) / 1000);
      const retryAfterMinutes = Math.ceil(retryAfter / 60);

      res.setHeader("Retry-After", retryAfter.toString());

      return next(new AppError(403, `Too many attempts. You have tried to send verification email too many times. Please try again after ${retryAfterMinutes} minutes.`, {
        code: "EMAIL_NOT_VERIFIED",
        email: normalizedEmail,
        rateLimited: true,
      }));
    }

    return next();
  } catch (error) {
    // On error, fail closed to prevent abuse
    return next(new AppError(503, "Rate limit service temporarily unavailable. Please try again."));
  }
};

export const twoFactorRateLimit = rateLimit({
  windowMs: config.auth.rateLimit.twoFactorWindowMs,
  maxRequests: config.auth.rateLimit.twoFactorMaxAttempts,
  message: "Too many 2FA requests. Please try again later.",
  failClosed: true,
});

export const twoFactorVerificationRateLimit = rateLimit({
  windowMs: config.auth.rateLimit.twoFactorVerificationWindowMs,
  maxRequests: config.auth.rateLimit.twoFactorVerificationMaxAttempts,
  message: "Too many verification attempts. Please try again later.",
  failClosed: true,
});

export const refreshTokenRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const ip = extractIPAddress(req) || "unknown";

  return rateLimit({
    windowMs: config.auth.rateLimit.refreshTokenWindowMs,
    maxRequests: config.auth.rateLimit.refreshTokenMaxAttempts,
    keyGenerator: () => `refresh:ip:${ip}`,
    message: "Too many token refresh requests. Please try again later.",
    failClosed: true,
  })(req, res, next);
};

export const verifyEmailRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const ip = extractIPAddress(req) || "unknown";

  return rateLimit({
    windowMs: config.auth.rateLimit.verifyEmailWindowMs,
    maxRequests: config.auth.rateLimit.verifyEmailMaxAttempts,
    keyGenerator: () => `verify-email:ip:${ip}`,
    message: "Too many email verification requests. Please try again later.",
    failClosed: true,
  })(req, res, next);
};

export const acceptInviteRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const ip = extractIPAddress(req) || "unknown";

  return rateLimit({
    windowMs: config.auth.rateLimit.acceptInviteWindowMs,
    maxRequests: config.auth.rateLimit.acceptInviteMaxAttempts,
    keyGenerator: () => `accept-invite:ip:${ip}`,
    message: "Too many invite acceptance attempts. Please try again later.",
    failClosed: true,
  })(req, res, next);
};

export const validateInviteRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const ip = extractIPAddress(req) || "unknown";

  return rateLimit({
    windowMs: config.auth.rateLimit.validateInviteWindowMs,
    maxRequests: config.auth.rateLimit.validateInviteMaxAttempts,
    keyGenerator: () => `validate-invite:ip:${ip}`,
    message: "Too many invite validation requests. Please try again later.",
    failClosed: true,
  })(req, res, next);
};

/** CRM connect / test / sync / backfill / disconnect — per company user, fail open on store errors. */
export const crmMutationRateLimit = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 60,
  keyGenerator: (req: Request) => {
    const auth = (req as AuthenticatedRequest).user;
    const companyId = auth?.companyId ?? "unknown";
    const userId = auth?.id ?? "unknown";
    return `crm-mutate:${companyId}:${userId}`;
  },
  message: "Too many CRM actions. Please wait a minute and try again.",
});

// Helper function to check rate limit in service layer (without Express request)
export async function checkRateLimit(
  key: string,
  windowMs: number,
  maxRequests: number,
  options?: { failClosed?: boolean }
): Promise<{ allowed: boolean; retryAfter?: number }> {
  try {
    const now = Date.now();
    const updated = await consumeRateLimit(key, windowMs);

    if (updated.count > maxRequests) {
      const retryAfter = Math.ceil((updated.resetTime - now) / 1000);
      return { allowed: false, retryAfter };
    }

    return { allowed: true };
  } catch (error) {
    if (options?.failClosed) {
      return { allowed: false, retryAfter: Math.ceil(windowMs / 1000) };
    }
    // On non-critical paths, allow the request to proceed (fail open)
    return { allowed: true };
  }
}


