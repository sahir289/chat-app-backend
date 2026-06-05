import prisma from "../lib/prisma";
import type { Webhook, WebhookDelivery } from "@prisma/client";
import { AppError } from "../utils/appError";

export const webhookRepository = {
  async findByCompanyId(companyId: string): Promise<Webhook[]> {
    return prisma.webhook.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });
  },

  async findById(id: string, companyId?: string): Promise<Webhook | null> {
    return prisma.webhook.findFirst({
      where: {
        id,
        ...(companyId ? { companyId } : {}),
      },
    });
  },

  async create(data: {
    companyId: string;
    url: string;
    secret: string;
    events: string[];
    isActive?: boolean;
  }): Promise<Webhook> {
    return prisma.webhook.create({
      data: {
        companyId: data.companyId,
        url: data.url,
        secret: data.secret,
        events: data.events,
        isActive: data.isActive ?? true,
      },
    });
  },

  async update(id: string, companyId: string, data: {
    url?: string;
    secret?: string;
    events?: string[];
    isActive?: boolean;
  }): Promise<Webhook> {
    // First verify the webhook exists and belongs to the company
    const existing = await prisma.webhook.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      throw new AppError(404, "Webhook not found");
    }

    // Then update using only the id (since it's the unique identifier)
    return prisma.webhook.update({
      where: { id },
      data,
    });
  },

  async delete(id: string, companyId: string): Promise<void> {
    // First verify the webhook exists and belongs to the company
    const existing = await prisma.webhook.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      throw new AppError(404, "Webhook not found");
    }

    // Then delete using only the id (since it's the unique identifier)
    await prisma.webhook.delete({
      where: { id },
    });
  },

  async updateLastTriggered(id: string): Promise<void> {
    await prisma.webhook.update({
      where: { id },
      data: { lastTriggeredAt: new Date() },
    });
  },

  async createDelivery(data: {
    webhookId: string;
    event: string;
    payload: any;
    statusCode?: number | null;
    response?: string | null;
    error?: string | null;
  }): Promise<WebhookDelivery> {
    return prisma.webhookDelivery.create({
      data: {
        webhookId: data.webhookId,
        event: data.event,
        payload: data.payload,
        statusCode: data.statusCode,
        response: data.response,
        error: data.error,
      },
    });
  },

  async findDeliveriesByWebhookId(webhookId: string, limit: number = 50): Promise<WebhookDelivery[]> {
    return prisma.webhookDelivery.findMany({
      where: { webhookId },
      orderBy: { attemptedAt: "desc" },
      take: limit,
    });
  },

  async findDeliveryById(id: string): Promise<(WebhookDelivery & {
    webhook: {
      id: string;
      url: string;
      companyId: string;
    };
  }) | null> {
    return prisma.webhookDelivery.findUnique({
      where: { id },
      include: {
        webhook: {
          select: {
            id: true,
            url: true,
            companyId: true,
          },
        },
      },
    });
  },

  async findActiveWebhooksByEvent(event: string, companyId?: string): Promise<Webhook[]> {
    return prisma.webhook.findMany({
      where: {
        isActive: true,
        events: { has: event },
        ...(companyId ? { companyId } : {}),
      },
    });
  },
};

