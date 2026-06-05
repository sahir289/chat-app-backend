import type { NextFunction, Request, Response } from "express";
import { config } from "../config";
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from "../constants/authConstants";
import { AppError } from "../utils/appError";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value.split(",")[0]?.trim() || null;
  if (Array.isArray(value)) return value[0]?.split(",")[0]?.trim() || null;
  return null;
}

function getRequestOrigin(req: Request): string | null {
  const proto =
    (config.server.trustProxy ? firstHeaderValue(req.headers["x-forwarded-proto"]) : null) ||
    (req.secure ? "https" : "http");
  const host =
    (config.server.trustProxy ? firstHeaderValue(req.headers["x-forwarded-host"]) : null) ||
    firstHeaderValue(req.headers.host);

  return host ? `${proto}://${host}` : null;
}

function safeOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getTrustedOrigins(req: Request): Set<string> {
  const trusted = new Set<string>();
  const requestOrigin = safeOrigin(getRequestOrigin(req));
  const frontendOrigin = safeOrigin(config.urls.frontendUrl);

  if (requestOrigin) trusted.add(requestOrigin);
  if (frontendOrigin) trusted.add(frontendOrigin);
  for (const origin of config.cors.origins) {
    const parsed = safeOrigin(origin);
    if (parsed) trusted.add(parsed);
  }

  return trusted;
}

function hasAuthCookie(req: Request): boolean {
  return Boolean(req.cookies?.[ACCESS_COOKIE_NAME] || req.cookies?.[REFRESH_COOKIE_NAME]);
}

export function csrfProtectionMiddleware(req: Request, _res: Response, next: NextFunction) {
  if (!MUTATION_METHODS.has(req.method) || !hasAuthCookie(req)) {
    return next();
  }

  const origin = safeOrigin(firstHeaderValue(req.headers.origin));
  const referer = safeOrigin(firstHeaderValue(req.headers.referer));
  const trustedOrigins = getTrustedOrigins(req);
  const requestOrigin = origin || referer;

  if (!requestOrigin || !trustedOrigins.has(requestOrigin)) {
    return next(new AppError(403, "Cross-site request rejected"));
  }

  return next();
}
