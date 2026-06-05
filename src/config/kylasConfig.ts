import { serverConfig } from "./serverConfig";

function parseTimeoutMs(value: string | undefined): number {
    const parsed = Number.parseInt(value || "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 10000;
}

/** When unset, syncs account-registration leads only if NODE_ENV is production. Set to false on prod-like staging. */
function resolveAccountLeadSyncEnabled(): boolean {
    const v = process.env.KYLAS_ACCOUNT_LEAD_SYNC_ENABLED;
    if (v === "true") return true;
    if (v === "false") return false;
    return serverConfig.isProduction;
}

export const kylasConfig = {
    apiKey: process.env.KYLAS_API_KEY || "",
    baseUrl: process.env.KYLAS_API_BASE_URL || "https://api.kylas.io/v1",
    timeoutMs: parseTimeoutMs(process.env.KYLAS_TIMEOUT_MS),
    accountLeadSyncEnabled: resolveAccountLeadSyncEnabled(),
} as const;

