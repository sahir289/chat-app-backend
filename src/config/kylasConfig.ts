import { serverConfig } from "./serverConfig";

function parseTimeoutMs(value: string | undefined): number {
    const parsed = Number.parseInt(value || "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 10000;
}

function parsePositiveInt(value: string | undefined): number | undefined {
    const parsed = Number.parseInt(value || "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/** When unset, syncs account-registration leads only if NODE_ENV is production. Set to false on prod-like staging. */
function resolveAccountLeadSyncEnabled(): boolean {
    const v = process.env.KYLAS_ACCOUNT_LEAD_SYNC_ENABLED;
    if (v === "true") return true;
    if (v === "false") return false;
    return serverConfig.isProduction;
}

/** MitraVarta Lead Pipeline (Open stage) — override per tenant via env. */
const DEFAULT_PIPELINE_ID = 34715;
const DEFAULT_PIPELINE_STAGE_ID = 242969;
const DEFAULT_PROJECT_TITLE_ID = 2881302;

function resolveProjectTitleId(): number {
    return (
        parsePositiveInt(process.env.KYLAS_PROJECT_TITLE_ID) ??
        parsePositiveInt(process.env.KYLAS_PROJECT_TITLE_PICKLIST_ID) ??
        DEFAULT_PROJECT_TITLE_ID
    );
}

// export const kylasConfig = {
//     apiKey: process.env.KYLAS_API_KEY || "",
//     baseUrl: process.env.KYLAS_API_BASE_URL || "https://api.kylas.io/v1",
//     timeoutMs: parseTimeoutMs(process.env.KYLAS_TIMEOUT_MS),
//     accountLeadSyncEnabled: resolveAccountLeadSyncEnabled(),
//     pipelineId: parsePositiveInt(process.env.KYLAS_PIPELINE_ID) ?? DEFAULT_PIPELINE_ID,
//     pipelineStageId: parsePositiveInt(process.env.KYLAS_PIPELINE_STAGE_ID) ?? DEFAULT_PIPELINE_STAGE_ID,
//     projectTitleId: resolveProjectTitleId(),
//     subSource: process.env.KYLAS_LEAD_SUB_SOURCE?.trim() || "Chatbot",
//     utmSource: process.env.KYLAS_UTM_SOURCE?.trim() || "chatbot",
//     utmMedium: process.env.KYLAS_UTM_MEDIUM?.trim() || "website-signup",
//     utmCampaign: process.env.KYLAS_UTM_CAMPAIGN?.trim() || "new-account-registration",
// } as const;

