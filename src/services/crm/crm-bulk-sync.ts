import { AppError } from "../../utils/appError";

/** Maximum leads accepted per bulk CRM sync request (larger sets should use backfill). */
export const CRM_BULK_SYNC_MAX_LEAD_IDS = 100;

export function assertBulkSyncLeadIdsWithinLimit(leadIds: unknown[]): void {
  if (!Array.isArray(leadIds)) {
    throw new AppError(400, "leadIds must be an array");
  }
  const unique = new Set(
    leadIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim())
  );
  if (unique.size > CRM_BULK_SYNC_MAX_LEAD_IDS) {
    throw new AppError(
      400,
      `At most ${CRM_BULK_SYNC_MAX_LEAD_IDS} leads can be synced per request; use CRM backfill for larger batches`
    );
  }
}
