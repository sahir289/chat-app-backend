export const SCHEDULED_BOT_DELAY_MS = 10_000;
export const QUICK_REPLY_TYPING_DELAY_MS = 1_200;
/** After visitor file-only upload (AI on), wait before sending the human-handoff acknowledgment. */
export const FILE_UPLOAD_ACK_DELAY_MS = 2_500;
export const SCHEDULED_BOT_WORKER_POLL_MS = 1_000;
export const SCHEDULED_BOT_ITEM_TTL_SECONDS = 120;
export const SCHEDULED_BOT_LOCK_TTL_SECONDS = 30;
export const SCHEDULED_BOT_ZSET_KEY = "scheduled:bot:zset";
export const SCHEDULED_BOT_ITEM_KEY_PREFIX = "scheduled:bot:item:";
export const SCHEDULED_BOT_LOCK_KEY_PREFIX = "scheduled:bot:lock:";
