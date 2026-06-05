import { config } from "../config";
import { toErrorMessage } from "../helpers/auth/authHelpers";
import { getModuleLogger } from "../utils/logger";

type CreateAccountLeadInput = {
    fullName: string;
    email: string;
    phone: string;
    companyName?: string | null;
};

type KylasLeadPayload = {
    firstName: string;
    lastName?: string;
    emails: Array<{
        type: "OFFICE";
        value: string;
        primary: boolean;
    }>;
    phoneNumbers?: Array<{
        type: "MOBILE";
        value: string;
        primary: boolean;
    }>;
    companyName?: string;
    utmSource?: string;
    utmCampaign?: string;
    projectTitle?: string;
};

const log = getModuleLogger("kylasLeadService");
const DEFAULT_UTM_SOURCE = "chatbot";
const DEFAULT_UTM_CAMPAIGN = "new-account-registration";
const DEFAULT_PROJECT_TITLE = "MitraVarta";
const E164_PHONE_REGEX = /^\+[1-9]\d{9,14}$/;

function splitFullName(fullName: string): Pick<KylasLeadPayload, "firstName" | "lastName"> {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    const firstName = parts.shift() || fullName.trim();
    const lastName = parts.join(" ");

    return {
        firstName,
        ...(lastName ? { lastName } : {}),
    };
}

function normalizeLeadEndpoint(rawBaseUrl: string): string {
    const baseUrl = rawBaseUrl.trim().replace(/\/+$/, "");

    if (!baseUrl) {
        return "";
    }

    if (baseUrl.toLowerCase().endsWith("/leads")) {
        return `${baseUrl}/`;
    }

    return `${baseUrl}/leads/`;
}

function normalizePhoneForKylas(phoneRaw: string): string | null {
    const trimmed = phoneRaw.trim();
    if (!trimmed) {
        return null;
    }

    const compact = trimmed.replace(/[\s()-]/g, "");
    if (E164_PHONE_REGEX.test(compact)) {
        return compact;
    }

    return null;
}

function buildPayload(input: CreateAccountLeadInput): KylasLeadPayload {
    const name = splitFullName(input.fullName);
    const companyName = input.companyName?.trim();
    const phone = normalizePhoneForKylas(input.phone);

    return {
        ...name,
        emails: [
            {
                type: "OFFICE",
                value: input.email.toLowerCase().trim(),
                primary: true,
            },
        ],
        ...(phone
            ? {
                phoneNumbers: [
                    {
                        type: "MOBILE",
                        value: phone,
                        primary: true,
                    },
                ],
            }
            : {}),
        ...(companyName ? { companyName } : {}),
        utmSource: DEFAULT_UTM_SOURCE,
        utmCampaign: DEFAULT_UTM_CAMPAIGN,
        projectTitle: DEFAULT_PROJECT_TITLE,
    };
}

async function readResponseBody(response: Response): Promise<string> {
    try {
        return await response.text();
    } catch {
        return "";
    }
}

export const kylasLeadService = {
    async createAccountLead(input: CreateAccountLeadInput): Promise<void> {
        if (!config.kylas.accountLeadSyncEnabled) {
            log.debug("Kylas lead sync skipped because account lead sync is disabled", {
                nodeEnv: config.server.nodeEnv,
            });
            return;
        }

        const { apiKey, baseUrl, timeoutMs } = config.kylas;
        const endpoint = normalizeLeadEndpoint(baseUrl);

        if (!apiKey || !endpoint) {
            log.debug("Kylas lead sync skipped because API configuration is missing");
            return;
        }

        let endpointUrl: URL;
        try {
            endpointUrl = new URL(endpoint);
        } catch (error) {
            log.warn("Kylas lead sync skipped because base URL is invalid", {
                error: toErrorMessage(error),
            });
            return;
        }

        const payload = buildPayload(input);

        if (!payload.phoneNumbers?.length && input.phone.trim()) {
            log.warn("Kylas lead sync omitting invalid mobile number", {
                email: input.email.toLowerCase().trim(),
                phone: input.phone,
            });
        }

        const response = await fetch(endpointUrl.toString(), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                "api-key": apiKey,
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(timeoutMs),
        });

        if (!response.ok) {
            const responseBody = await readResponseBody(response);
            throw new Error(
                `Kylas lead create failed with status ${response.status}: ${responseBody.slice(0, 500)}`
            );
        }

        log.info("Kylas lead created for registered account", {
            email: payload.emails[0]?.value,
            phone: payload.phoneNumbers?.[0]?.value,
            companyName: payload.companyName,
        });
    },
};

