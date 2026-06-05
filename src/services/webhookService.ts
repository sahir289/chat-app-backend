import crypto from "crypto";
import { webhookRepository } from "../repositories/webhookRepository";
import { AppError } from "../utils/appError";
import { config } from "../config";
import { assertPublicHttpUrl, fetchPublicUrl } from "../utils/safeFetch";

async function validateWebhookUrl(url: string): Promise<void> {
  await assertPublicHttpUrl(url, {
    allowPrivateHosts: !config.server.isProduction,
  });
}

export const webhookService = {
  generateSecret(): string {
    return crypto.randomBytes(32).toString("hex");
  },

  async createWebhook(data: {
    companyId: string;
    url: string;
    events: string[];
    isActive?: boolean;
  }) {
    if (!data.url || !data.events || data.events.length === 0) {
      throw new AppError(400, "url and events are required");
    }

    await validateWebhookUrl(data.url);

    const secret = this.generateSecret();

    return webhookRepository.create({
      companyId: data.companyId,
      url: data.url,
      secret,
      events: data.events,
      isActive: data.isActive,
    });
  },

  async getWebhookById(id: string, companyId?: string) {
    const webhook = await webhookRepository.findById(id, companyId);
    if (!webhook) {
      throw new AppError(404, "Webhook not found");
    }
    return webhook;
  },

  async listWebhooks(companyId: string) {
    return webhookRepository.findByCompanyId(companyId);
  },

  async updateWebhook(id: string, companyId: string, data: {
    url?: string;
    events?: string[];
    isActive?: boolean;
  }) {
    const webhook = await webhookRepository.findById(id, companyId);
    if (!webhook) {
      throw new AppError(404, "Webhook not found");
    }

    if (data.url) {
      await validateWebhookUrl(data.url);
    }

    return webhookRepository.update(id, companyId, data);
  },

  async deleteWebhook(id: string, companyId: string) {
    const webhook = await webhookRepository.findById(id, companyId);
    if (!webhook) {
      throw new AppError(404, "Webhook not found");
    }

    await webhookRepository.delete(id, companyId);
  },

  async getDeliveries(webhookId: string, companyId: string, limit: number = 50) {
    const webhook = await webhookRepository.findById(webhookId, companyId);
    if (!webhook) {
      throw new AppError(404, "Webhook not found");
    }

    return webhookRepository.findDeliveriesByWebhookId(webhookId, limit);
  },

  async getDeliveryById(id: string, companyId: string) {
    const delivery = await webhookRepository.findDeliveryById(id);
    if (!delivery) {
      throw new AppError(404, "Delivery not found");
    }

    if (delivery.webhook.companyId !== companyId) {
      throw new AppError(403, "Access denied");
    }

    return delivery;
  },

  async triggerWebhook(webhookId: string, event: string, payload: any) {
    const webhook = await webhookRepository.findById(webhookId);
    if (!webhook || !webhook.isActive) {
      throw new AppError(404, "Webhook not found or inactive");
    }

    if (!webhook.events.includes(event)) {
      throw new AppError(400, "Event not configured for this webhook");
    }

    const signature = this.generateSignature(JSON.stringify(payload), webhook.secret);

    try {
      const response = await fetchPublicUrl(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
          "X-Webhook-Event": event,
        },
        body: JSON.stringify(payload),
      }, {
        allowPrivateHosts: !config.server.isProduction,
        timeoutMs: 10000,
        maxRedirects: 3,
      });

      await webhookRepository.updateLastTriggered(webhookId);

      const responseText = await response.text().catch(() => "");

      await webhookRepository.createDelivery({
        webhookId,
        event,
        payload,
        statusCode: response.status,
        response: responseText.substring(0, 1000),
        error: response.ok ? null : `HTTP ${response.status}`,
      });

      return {
        success: response.ok,
        statusCode: response.status,
        response: responseText,
      };
    } catch (error: any) {
      await webhookRepository.createDelivery({
        webhookId,
        event,
        payload,
        statusCode: null,
        response: null,
        error: error.message || "Network error",
      });

      throw error;
    }
  },

  async triggerWebhooksForEvent(event: string, payload: any, companyId?: string) {
    const webhooks = await webhookRepository.findActiveWebhooksByEvent(event, companyId);

    const results = await Promise.allSettled(
      webhooks.map((webhook) => this.triggerWebhook(webhook.id, event, payload))
    );

    return {
      total: webhooks.length,
      successful: results.filter((r) => r.status === "fulfilled").length,
      failed: results.filter((r) => r.status === "rejected").length,
    };
  },

  generateSignature(payload: string, secret: string): string {
    return crypto.createHmac("sha256", secret).update(payload).digest("hex");
  },

  verifySignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = this.generateSignature(payload, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  },
};

