import prisma from "../lib/prisma";
import type { Property } from "@prisma/client";
import { AppError } from "../utils/appError";

export const propertyRepository = {

  async create(data: { companyId: string; name: string; domain?: string | null; widgetKey: string }) {
    return prisma.property.create({
      data: {
        companyId: data.companyId,
        name: data.name,
        domain: data.domain ?? null,
        widgetKey: data.widgetKey,
      },
    });
  },

  async listAll(companyId: string): Promise<Property[]> {
    return prisma.property.findMany({
      where: { deletedAt: null, companyId },
      orderBy: { createdAt: "desc" },
    });
  },

  async findByWidgetKey(widgetKey: string): Promise<Property | null> {
    return prisma.property.findFirst({
      where: {
        widgetKey,
        deletedAt: null,
      },
    });
  },

  async findById(id: string, companyId: string): Promise<Property | null> {
    return prisma.property.findFirst({
      where: {
        id,
        companyId,
        deletedAt: null,
      },
    });
  },

  async softDeleteById(id: string, companyId: string): Promise<Property | null> {
    // First verify the property exists and belongs to the company
    const existing = await prisma.property.findFirst({
      where: { id, companyId, deletedAt: null },
    });

    if (!existing) {
      throw new AppError(404, "Property not found");
    }

    // Then soft delete using only the id (since it's the unique identifier)
    const result = await prisma.property.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return result;
  },

  async update(id: string, companyId: string, data: {
    name?: string;
    domain?: string | null;
  }): Promise<Property | null> {
    // First verify the property exists and belongs to the company
    const existing = await prisma.property.findFirst({
      where: { id, companyId, deletedAt: null },
    });

    if (!existing) {
      throw new AppError(404, "Property not found");
    }

    // Then update using only the id (since it's the unique identifier)
    return prisma.property.update({
      where: { id },
      data: {
        name: data.name,
        domain: data.domain,
      },
    });
  },

  async updateSettings(id: string, companyId: string, data: {
    chatbotName?: string | null;
    chatbotLogo?: string | null;
    launcherButtonColor?: string | null;
    primaryColor?: string | null;
    backgroundColor?: string | null;
    textColor?: string | null;
    leftMessageBackgroundColor?: string | null;
    leftMessageTextColor?: string | null;
    rightMessageBackgroundColor?: string | null;
    rightMessageTextColor?: string | null;
    welcomeMessage?: string | null;
    position?: string | null;
    aiEnabled?: boolean;
    removeBranding?: boolean;
    openAiChatModelId?: string | null;
  }): Promise<Property | null> {
    // First verify the property exists and belongs to the company
    const existing = await prisma.property.findFirst({
      where: { id, companyId, deletedAt: null },
    });

    if (!existing) {
      throw new AppError(404, "Property not found");
    }

    try {
      // Then update using only the id (since it's the unique identifier)
      // Note: Using type assertion because Prisma client types may be out of sync with schema
      const updateData: any = {
        chatbotName: data.chatbotName === "" ? null : (data.chatbotName ?? undefined),
        chatbotLogo: data.chatbotLogo === "" ? null : (data.chatbotLogo ?? undefined),
        launcherButtonColor: data.launcherButtonColor === "" ? null : (data.launcherButtonColor ?? undefined),
        primaryColor: data.primaryColor === "" ? null : (data.primaryColor ?? undefined),
        backgroundColor: data.backgroundColor === "" ? null : (data.backgroundColor ?? undefined),
        textColor: data.textColor === "" ? null : (data.textColor ?? undefined),
        leftMessageBackgroundColor: data.leftMessageBackgroundColor === "" ? null : (data.leftMessageBackgroundColor ?? undefined),
        leftMessageTextColor: data.leftMessageTextColor === "" ? null : (data.leftMessageTextColor ?? undefined),
        rightMessageBackgroundColor: data.rightMessageBackgroundColor === "" ? null : (data.rightMessageBackgroundColor ?? undefined),
        rightMessageTextColor: data.rightMessageTextColor === "" ? null : (data.rightMessageTextColor ?? undefined),
        welcomeMessage: data.welcomeMessage === "" ? null : (data.welcomeMessage ?? undefined),
        position: data.position === "" ? null : (data.position ?? undefined),
        aiEnabled: data.aiEnabled !== undefined ? data.aiEnabled : undefined,
        removeBranding: data.removeBranding !== undefined ? data.removeBranding : undefined,
        openAiChatModelId:
          data.openAiChatModelId === undefined
            ? undefined
            : data.openAiChatModelId === "" || data.openAiChatModelId === null
              ? null
              : data.openAiChatModelId,
      };
      const updated = await prisma.property.update({
        where: { id },
        data: updateData,
      });
      return updated;
    } catch (error: any) {
      if (error.code === 'P2025') {
        return null;
      }
      throw error;
    }
  },
};


