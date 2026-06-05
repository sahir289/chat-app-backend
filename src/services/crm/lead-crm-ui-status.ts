import type { CrmSyncStatus } from "@prisma/client";

export type LeadCrmUiStatus = "Not synced" | "Queued" | "Synced" | "Failed" | "Retrying";

/**
 * Latest sync log takes precedence over stale LeadCrmLink rows (e.g. FAILED after an earlier success).
 */
export function resolveLeadCrmUiStatus(
  link: { crmContactId?: string | null; lastSyncedAt?: Date | string | null } | null | undefined,
  log: { status: CrmSyncStatus; retryCount?: number | null } | null | undefined
): LeadCrmUiStatus {
  if (log?.status === "FAILED") {
    return "Failed";
  }
  if (log?.status === "PENDING") {
    if ((log.retryCount ?? 0) > 0) {
      return "Retrying";
    }
    return "Queued";
  }
  if (link?.crmContactId || link?.lastSyncedAt) {
    return "Synced";
  }
  if (log?.status === "SUCCESS") {
    return "Synced";
  }
  return "Not synced";
}
