import { fetchPublicUrl } from "../../../utils/safeFetch";
import type {
  CrmProviderClient,
  CrmProviderSyncInput,
  CrmProviderSyncResult,
} from "../crm.types";
import {
  getHubSpotContactPropertyNamesCached,
  setHubSpotContactPropertyNamesCached,
} from "../hubspot-contact-properties-cache";

const HUBSPOT_BASE_URL = "https://api.hubapi.com";
const MAX_429_RETRIES = 3;
const MAX_TRANSIENT_RETRIES = 2;
const BASE_BACKOFF_MS = 500;

type HubSpotErrorPayload = {
  message?: string;
  category?: string;
  status?: string;
  errors?: Array<{ message?: string; code?: string }>;
};

export class HubSpotApiError extends Error {
  readonly statusCode?: number;
  readonly category?: string;
  readonly retryAfterMs?: number;
  readonly isAuthError: boolean;
  readonly isRateLimit: boolean;
  readonly isTransient: boolean;
  readonly details?: HubSpotErrorPayload;

  constructor(params: {
    message: string;
    statusCode?: number;
    category?: string;
    retryAfterMs?: number;
    details?: HubSpotErrorPayload;
  }) {
    super(params.message);
    this.name = "HubSpotApiError";
    this.statusCode = params.statusCode;
    this.category = params.category;
    this.retryAfterMs = params.retryAfterMs;
    this.details = params.details;
    this.isAuthError = params.statusCode === 401 || params.statusCode === 403;
    this.isRateLimit = params.statusCode === 429;
    this.isTransient = params.statusCode === 429 || (typeof params.statusCode === "number" && params.statusCode >= 500);
  }
}

export class HubSpotCrmProvider implements CrmProviderClient {
  constructor(
    private readonly serviceKeyToken: string,
    private readonly portalId?: string | null,
    /** CrmIntegration id — used to cache contact property names per portal (TTL). */
    private readonly integrationId?: string | null
  ) {}

  async testConnection(): Promise<CrmProviderSyncResult> {
    const result = await this.requestJson<{ results?: Array<{ id?: string }> }>(
      "/crm/v3/objects/contacts?limit=1&properties=email",
      { method: "GET" }
    );

    return {
      success: true,
      responsePayload: {
        ok: true,
        portalId: this.portalId ?? null,
        sampleContactId: result.results?.[0]?.id ?? null,
      },
    };
  }

  async syncLead(input: CrmProviderSyncInput): Promise<CrmProviderSyncResult> {
    const { properties, skippedProperties } = await this.filterSupportedContactProperties(
      sanitizeProperties(input.mappedFields)
    );

    let contactId = input.existingCrmContactId ?? null;
    let action: "created" | "updated" = "updated";

    // Prefer explicit LeadCrmLink / stable id only — do not resolve by shared email/phone (multiple leads can collide).
    if (!contactId) {
      const chatbotLeadId = String(properties.chatbot_lead_id ?? input.lead.leadId ?? "").trim();
      if (chatbotLeadId && (await this.hasContactProperty("chatbot_lead_id"))) {
        contactId = await this.findContactIdByProperty("chatbot_lead_id", chatbotLeadId).catch(() => null);
      }
    }

    if (contactId) {
      await this.updateContact(contactId, properties);
    } else {
      contactId = await this.createContact(properties);
      action = "created";
    }

    return {
      success: true,
      crmContactId: contactId,
      responsePayload: {
        action,
        contactId,
        skippedUnsupportedProperties: skippedProperties,
        warning: skippedProperties.length > 0
          ? `Skipped unsupported HubSpot contact properties: ${skippedProperties.join(", ")}`
          : null,
      },
    };
  }

  private async filterSupportedContactProperties(properties: Record<string, unknown>): Promise<{
    properties: Record<string, unknown>;
    skippedProperties: string[];
  }> {
    const supportedPropertyNames = await this.getContactPropertyNameSet();
    const filtered: Record<string, unknown> = {};
    const skippedProperties: string[] = [];

    for (const [key, value] of Object.entries(properties)) {
      if (supportedPropertyNames.has(key)) {
        filtered[key] = value;
      } else {
        skippedProperties.push(key);
      }
    }

    return { properties: filtered, skippedProperties };
  }

  private async hasContactProperty(propertyName: string): Promise<boolean> {
    return (await this.getContactPropertyNameSet()).has(propertyName);
  }

  private async getContactPropertyNameSet(): Promise<Set<string>> {
    if (this.integrationId) {
      const cached = getHubSpotContactPropertyNamesCached(this.integrationId);
      if (cached) {
        return cached;
      }
    }

    const result = await this.requestJson<{ results?: Array<{ name?: string }> }>(
      "/crm/v3/properties/contacts",
      { method: "GET" }
    );

    const names = new Set(
      (result.results ?? [])
        .map((property) => property.name)
        .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
    );

    if (this.integrationId) {
      setHubSpotContactPropertyNamesCached(this.integrationId, names);
    }

    return names;
  }

  private async findContactIdByProperty(propertyName: string, value: string): Promise<string | null> {
    const result = await this.requestJson<{ results?: Array<{ id?: string }> }>(
      "/crm/v3/objects/contacts/search",
      {
        method: "POST",
        body: {
          limit: 1,
          filterGroups: [
            {
              filters: [
                {
                  propertyName,
                  operator: "EQ",
                  value,
                },
              ],
            },
          ],
          properties: ["email", "phone"],
        },
      }
    );

    return result.results?.[0]?.id ?? null;
  }

  private async createContact(properties: Record<string, unknown>): Promise<string> {
    const result = await this.requestJson<{ id?: string }>(
      "/crm/v3/objects/contacts",
      {
        method: "POST",
        body: { properties },
      }
    );

    if (!result.id) {
      throw new Error("HubSpot contact creation did not return an ID");
    }
    return result.id;
  }

  private async updateContact(contactId: string, properties: Record<string, unknown>): Promise<void> {
    await this.requestJson(
      `/crm/v3/objects/contacts/${encodeURIComponent(contactId)}`,
      {
        method: "PATCH",
        body: { properties },
      }
    );
  }

  private async requestJson<T = any>(
    path: string,
    options: { method: "GET" | "POST" | "PATCH"; body?: unknown }
  ): Promise<T> {
    let attempt = 0;
    let transientAttempts = 0;

    while (true) {
      attempt += 1;
      try {
        const response = await fetchPublicUrl(
          `${HUBSPOT_BASE_URL}${path}`,
          {
            method: options.method,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.serviceKeyToken}`,
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
          },
          { timeoutMs: 15000, maxRedirects: 2 }
        );

        const rawText = await response.text().catch(() => "");
        const parsed = parseJson(rawText) as HubSpotErrorPayload;

        if (!response.ok) {
          const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
          const category = extractHubspotErrorCategory(parsed);
          const message = extractHubspotErrorMessage(parsed) ?? `HubSpot API returned HTTP ${response.status}`;
          const error = new HubSpotApiError({
            message,
            statusCode: response.status,
            category,
            retryAfterMs,
            details: parsed,
          });

          if (error.isRateLimit && attempt <= MAX_429_RETRIES) {
            const fallbackBackoff = exponentialBackoffMs(attempt);
            await sleep(error.retryAfterMs ?? fallbackBackoff);
            continue;
          }
          throw error;
        }

        return parsed as T;
      } catch (error) {
        if (!isRetryableTransportError(error)) {
          throw error;
        }

        transientAttempts += 1;
        if (transientAttempts > MAX_TRANSIENT_RETRIES) {
          throw new HubSpotApiError({
            message: error instanceof Error ? error.message : "HubSpot request failed due to network/timeout error",
          });
        }

        await sleep(exponentialBackoffMs(transientAttempts));
      }
    }
  }
}

function sanitizeProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value === null || value === undefined) continue;
    const stringValue = typeof value === "string" ? value.trim() : value;
    if (stringValue === "") continue;
    sanitized[key] = stringValue;
  }
  return sanitized;
}

function parseJson(value: string): any {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return { message: value.slice(0, 500) };
  }
}

function extractHubspotErrorMessage(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    const first = payload.errors[0];
    if (first && typeof first.message === "string" && first.message.trim()) return first.message;
  }
  return null;
}

function extractHubspotErrorCategory(payload: any): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  return typeof payload.category === "string" ? payload.category : undefined;
}

function parseRetryAfterMs(retryAfterValue: string | null): number | undefined {
  if (!retryAfterValue) return undefined;
  const seconds = Number.parseInt(retryAfterValue, 10);
  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1000;
  }
  const retryAt = Date.parse(retryAfterValue);
  if (Number.isNaN(retryAt)) return undefined;
  const diff = retryAt - Date.now();
  return diff > 0 ? diff : undefined;
}

function exponentialBackoffMs(attempt: number) {
  return BASE_BACKOFF_MS * (2 ** Math.max(attempt - 1, 0));
}

function isRetryableTransportError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("enotfound") ||
    message.includes("eai_again")
  );
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
