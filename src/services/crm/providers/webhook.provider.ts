/**
 * Custom webhook CRM delivery — JSON payloads with HMAC-SHA256 (`X-Signature`) are suited for
 * Zapier, Make, n8n, or any HTTPS endpoint that accepts structured lead/chat events.
 */
import crypto from "node:crypto";
import { config } from "../../../config";
import { fetchPublicUrl } from "../../../utils/safeFetch";
import type {
  CrmProviderClient,
  CrmProviderSyncInput,
  CrmProviderSyncResult,
} from "../crm.types";

export class WebhookCrmProvider implements CrmProviderClient {
  constructor(
    private readonly webhookUrl: string,
    private readonly secret: string
  ) {}

  async testConnection(): Promise<CrmProviderSyncResult> {
    const payload = {
      event: "crm.test",
      timestamp: new Date().toISOString(),
      source: "chatbot",
    };

    const responsePayload = await this.post(payload, "crm.test");
    return {
      success: true,
      responsePayload,
    };
  }

  async syncLead(input: CrmProviderSyncInput): Promise<CrmProviderSyncResult> {
    const payload = {
      event: input.event,
      source: input.lead.source.toLowerCase(),
      channel: input.lead.channel,
      lead: {
        id: input.lead.leadId,
        name: input.lead.name,
        email: input.lead.email,
        phone: input.lead.phone,
        companyName: input.lead.companyName,
        source: input.lead.source.toLowerCase(),
        channel: input.lead.channel,
        status: input.lead.status,
        message: input.lead.message,
        customFields: input.lead.customFields,
      },
      chat: {
        id: input.lead.chatId,
        sessionId: input.lead.chatSessionId,
        summary: input.lead.chatSummary,
        transcript: input.lead.transcript,
        assignedAgentId: input.lead.assignedAgentId,
        assignedAgentName: input.lead.assignedAgentName,
      },
      tracking: {
        pageUrl: input.lead.pageUrl,
        browser: input.lead.browser,
        device: input.lead.device,
        country: input.lead.country,
        city: input.lead.city,
      },
      mappedFields: input.mappedFields,
      duplicateKey: {
        email: input.lead.email,
        phone: input.lead.phone,
        chatbotLeadId: input.lead.leadId,
        existingCrmContactId: input.existingCrmContactId ?? null,
      },
    };

    const responsePayload = await this.post(payload, input.event);
    const responseRecord = isRecord(responsePayload) ? responsePayload : {};

    return {
      success: true,
      crmContactId: readString(responseRecord, ["crmContactId", "contactId", "id"]),
      crmDealId: readString(responseRecord, ["crmDealId", "dealId"]),
      responsePayload,
    };
  }

  private async post(payload: unknown, event: string): Promise<unknown> {
    const body = JSON.stringify(payload);
    const signature = crypto.createHmac("sha256", this.secret).update(body).digest("hex");

    const response = await fetchPublicUrl(
      this.webhookUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Signature": signature,
          "X-CRM-Event": event,
        },
        body,
      },
      {
        allowPrivateHosts: !config.server.isProduction,
        timeoutMs: 10000,
        maxRedirects: 3,
      }
    );

    const responseText = await response.text().catch(() => "");
    let parsed: unknown = responseText;
    try {
      parsed = responseText ? JSON.parse(responseText) : null;
    } catch {
      parsed = responseText.substring(0, 1000);
    }

    if (!response.ok) {
      throw new Error(`Webhook CRM returned HTTP ${response.status}`);
    }

    return parsed;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}
