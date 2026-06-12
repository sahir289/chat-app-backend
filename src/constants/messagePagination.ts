export const DEFAULT_MESSAGES_LIMIT = 50;
export const MAX_MESSAGES_LIMIT = 100;

export function normalizeMessagesLimit(raw?: string | number | null): number {
  if (raw === undefined || raw === null || raw === "") {
    return DEFAULT_MESSAGES_LIMIT;
  }

  const parsed = typeof raw === "string" ? Number.parseInt(raw, 10) : raw;
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_MESSAGES_LIMIT;
  }

  return Math.min(Math.floor(parsed), MAX_MESSAGES_LIMIT);
}
