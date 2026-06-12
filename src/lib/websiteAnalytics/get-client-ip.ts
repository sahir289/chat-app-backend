import type { Request } from "express";

import { extractClientIp } from "../../utils/requestMeta";

/**
 * Resolves client IP for analytics using the same trust-proxy rules as the rest of the app.
 */
export function getClientIp(request: Request): string | null {
    return extractClientIp(request);
}
