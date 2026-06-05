import type { CrmProvider } from "@prisma/client";
import { HubSpotApiError } from "./providers/hubspot.provider";
import { CRM_SYNC_MAX_ATTEMPTS } from "./crm-sync.queue";

/**
 * HubSpot: disconnect only on 401/403. Webhook / transport: never auto-disconnect.
 */
export function classifyCrmError(
  error: unknown,
  provider: CrmProvider,
  attempt?: number
): { disconnectIntegration: boolean; retryable: boolean } {
  if (provider === "HUBSPOT" && error instanceof HubSpotApiError) {
    return {
      disconnectIntegration: Boolean(error.statusCode === 401 || error.statusCode === 403),
      retryable: error.isRateLimit || error.isTransient,
    };
  }

  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const retryableMessage =
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("etimedout") ||
    message.includes("econnreset");

  return {
    disconnectIntegration: false,
    retryable: retryableMessage && (attempt ?? 1) < CRM_SYNC_MAX_ATTEMPTS,
  };
}
