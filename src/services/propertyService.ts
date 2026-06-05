import { customAlphabet } from "nanoid";
import prisma from "../lib/prisma";
import { propertyRepository } from "../repositories/propertyRepository";
import { faqRepository } from "../repositories/faqRepository";
import { quickReplyRepository } from "../repositories/quickReplyRepository";
import { AppError } from "../utils/appError";
import type { PropertyDTO, PropertySettingsDTO } from "../types/property";
import { agentAccessService } from "./agentAccessService";
import { checkAgentPropertyAccess } from "../utils/agentPropertyFilter";
import { getPresignedUrl } from "./s3Service";
import { Role } from "@prisma/client";
import { defaultOpenAiChatFallback, resolveEffectiveOpenAiChatModel, sanitizeOpenAiModelIdList } from "../utils/openaiChatModelResolver";
const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 24);

export const propertyService = {

  async createPropertyWithSnippet(params: {
    companyId: string;
    name: string;
    domain?: string;
    backendBase: string;
    userId?: string;
    userRole?: Role;
  }): Promise<{ property: PropertyDTO; snippet: string }> {
    const { companyId, name, domain, backendBase, userId, userRole } = params;

    if (!companyId) {
      throw new AppError(403, "Forbidden: Company context required");
    }

    const normalizedName = typeof name === "string" ? name.trim() : "";
    const normalizedDomain =
      domain === undefined || domain === null || domain === ""
        ? null
        : (() => {
            const trimmed = String(domain).trim();
            return trimmed === "" ? null : trimmed;
          })();

    if (!normalizedName) {
      throw new AppError(400, "Website name is required");
    }

    // Check subscription plan and property limit
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { isPro: true },
    });

    if (!company) {
      throw new AppError(404, "Company not found");
    }

    const isPro = company.isPro || false;

    // For free plan, check property limit (3 properties max)
    if (!isPro) {
      const propertyCount = await prisma.property.count({
        where: {
          companyId,
          deletedAt: null, // Only count non-deleted properties
        },
      });

      if (propertyCount >= 3) {
        throw new AppError(
          403,
          `Property limit reached for this company (${propertyCount}/3). Free plan allows up to 3 properties per company. Please upgrade to Pro for unlimited properties.`
        );
      }
    }

    // Check if a property with the same name already exists for this company
    const existingPropertyWithName = await prisma.property.findFirst({
      where: {
        companyId,
        name: normalizedName,
        deletedAt: null,
      },
    });

    if (existingPropertyWithName) {
      throw new AppError(
        400,
        "Website name already exists"
      );
    }

    const widgetKey = "wgt_" + nanoid();

    try {
      const property = await propertyRepository.create({
        companyId,
        name: normalizedName,
        domain: normalizedDomain,
        widgetKey,
      });

      // If the creator is an agent, automatically grant them access to the property
      // This ensures agents can see properties they create in real-time
      if (userRole === Role.AGENT && userId) {
        try {
          await prisma.agentPropertyAccess.create({
            data: {
              userId,
              propertyId: property.id,
            },
          });
        } catch (accessError: any) {
          // If access record already exists (shouldn't happen for new property), ignore
          // If it's a different error, log but don't fail the property creation
          if (accessError?.code !== "P2002") {
            console.error("Failed to grant agent access to newly created property:", accessError);
          }
        }
      }

      const snippet = `
<script>
  (function () {
    var s = document.createElement("script");
    s.src = "${backendBase}/widget.js?widgetKey=${property.widgetKey}";
    s.async = true;
    document.head.appendChild(s);
  })();
</script>
`.trim();

      return {
        property,
        snippet,
      };
    } catch (error: any) {
      // Handle Prisma unique constraint violation for domain
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        const target = error.meta?.target as string[] | undefined;
        // Check if it's the companyId+domain unique constraint
        if (target && target.includes("domain") && target.includes("companyId")) {
          throw new AppError(
            400,
            normalizedDomain
              ? `A property with the domain "${normalizedDomain}" already exists. Please use a different domain or update the existing property.`
              : "A property with this configuration already exists. Please use a different domain or update the existing property."
          );
        }
        // Handle other unique constraint violations
        if (target && target.includes("domain")) {
          throw new AppError(400, `A property with the domain "${normalizedDomain}" already exists. Please use a different domain.`);
        }
        // Generic unique constraint error
        const field = target?.[0] || "field";
        throw new AppError(400, `${field} already exists`);
      }
      throw error;
    }
  },

  async listProperties(companyId: string, userId?: string, userRole?: Role): Promise<PropertyDTO[]> {
    const convertLogoToSignedUrl = async (logo: string | null): Promise<string | null> => {
      if (!logo) return null;

      if (logo.startsWith('http://') || logo.startsWith('https://')) {
        return logo;
      }
      try {
        return await getPresignedUrl(logo, companyId, 3600);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return null;
      }
    };

    const companyPolicy = await prisma.company.findUnique({
      where: { id: companyId },
      select: { isPro: true, allowedOpenAiChatModels: true },
    });
    const allowedOpenAiChatModels = sanitizeOpenAiModelIdList(companyPolicy?.allowedOpenAiChatModels);
    const isPro = companyPolicy?.isPro ?? false;
    const envFallback = defaultOpenAiChatFallback();

    if (userRole === Role.AGENT && userId) {
      const agentPropertyIds = await agentAccessService.getAgentPropertyIds(userId);

      // Agents can only see explicitly assigned properties.
      if (agentPropertyIds.length === 0) {
        return [];
      }

      const props = await prisma.property.findMany({
        where: {
          companyId,
          deletedAt: null,
          id: { in: agentPropertyIds },
        },
        orderBy: { createdAt: "desc" },
      });

      const propertiesWithSignedUrls = await Promise.all(
        props.map(async (p) => {
          const property = p as any; // Type assertion until Prisma client is regenerated
          const propertySelectedModelId = (p as { openAiChatModelId?: string | null }).openAiChatModelId ?? null;
          const effectiveOpenAiChatModelId = resolveEffectiveOpenAiChatModel({
            isPro,
            allowedModelIds: allowedOpenAiChatModels,
            propertySelectedModelId,
            envFallback,
          });
          return {
            id: p.id,
            name: p.name,
            domain: p.domain,
            widgetKey: p.widgetKey,
            createdAt: p.createdAt,
            chatbotName: p.chatbotName,
            chatbotLogo: await convertLogoToSignedUrl(p.chatbotLogo),
            launcherButtonColor: p.launcherButtonColor,
            primaryColor: p.primaryColor,
            backgroundColor: p.backgroundColor,
            textColor: p.textColor,
            leftMessageBackgroundColor: property.leftMessageBackgroundColor,
            leftMessageTextColor: property.leftMessageTextColor,
            rightMessageBackgroundColor: property.rightMessageBackgroundColor,
            rightMessageTextColor: property.rightMessageTextColor,
            welcomeMessage: p.welcomeMessage,
            position: p.position,
            aiEnabled: p.aiEnabled,
            removeBranding: p.removeBranding,
            openAiChatModelId: propertySelectedModelId,
            allowedOpenAiChatModels,
            effectiveOpenAiChatModelId,
          };
        })
      );

      return propertiesWithSignedUrls;
    }

    const props = await propertyRepository.listAll(companyId);

    const propertiesWithSignedUrls = await Promise.all(
      props.map(async (p) => {
        const property = p as any; // Type assertion until Prisma client is regenerated
        const propertySelectedModelId = (p as { openAiChatModelId?: string | null }).openAiChatModelId ?? null;
        const effectiveOpenAiChatModelId = resolveEffectiveOpenAiChatModel({
          isPro,
          allowedModelIds: allowedOpenAiChatModels,
          propertySelectedModelId,
          envFallback,
        });
        return {
          id: p.id,
          name: p.name,
          domain: p.domain,
          widgetKey: p.widgetKey,
          createdAt: p.createdAt,
          chatbotName: p.chatbotName,
          chatbotLogo: await convertLogoToSignedUrl(p.chatbotLogo),
          launcherButtonColor: p.launcherButtonColor,
          primaryColor: p.primaryColor,
          backgroundColor: p.backgroundColor,
          textColor: p.textColor,
          leftMessageBackgroundColor: property.leftMessageBackgroundColor,
          leftMessageTextColor: property.leftMessageTextColor,
          rightMessageBackgroundColor: property.rightMessageBackgroundColor,
          rightMessageTextColor: property.rightMessageTextColor,
          welcomeMessage: p.welcomeMessage,
          position: p.position,
          aiEnabled: p.aiEnabled,
          removeBranding: p.removeBranding,
          openAiChatModelId: propertySelectedModelId,
          allowedOpenAiChatModels,
          effectiveOpenAiChatModelId,
        };
      })
    );

    return propertiesWithSignedUrls;
  },

  async updateSettings(companyId: string, id: string, settings: {
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
  }, userId?: string, userRole?: string): Promise<PropertyDTO> {
    const existing = await propertyRepository.findById(id, companyId);
    if (!existing) {
      throw new AppError(404, "Property not found");
    }

    if (userRole === "AGENT" && userId) {
      const hasAccess = await checkAgentPropertyAccess(userId, id);
      if (!hasAccess) {
        throw new AppError(403, "Access denied. You don't have permission to access this property.");
      }
    }

    // Check company Pro status once
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { isPro: true, allowedOpenAiChatModels: true },
    });
    const isPro = company?.isPro ?? false;
    const allowedModels = sanitizeOpenAiModelIdList(company?.allowedOpenAiChatModels);
    const envFallback = defaultOpenAiChatFallback();

    if (settings.openAiChatModelId !== undefined) {
      if (!isPro) {
        delete settings.openAiChatModelId;
      } else {
        const raw = settings.openAiChatModelId;
        if (raw === null || raw === "") {
          settings.openAiChatModelId = null;
        } else if (allowedModels.length === 0) {
          throw new AppError(
            400,
            "No AI models are assigned to your organization yet. Please contact support to enable a model before selecting one."
          );
        } else if (!allowedModels.includes(raw)) {
          throw new AppError(400, "That model is not available for your organization.");
        }
      }
    }

    // Handle removeBranding setting for free users
    if (settings.removeBranding !== undefined) {
      if (!isPro) {
        // Free users cannot remove branding
        delete settings.removeBranding;
      }
    }

    // Handle AI enabled setting for free users
    if (settings.aiEnabled === true) {
      // For free users, filter out aiEnabled from settings so other settings can still be saved
      // This allows free users to save other settings even if aiEnabled is true in the request
      if (!isPro) {
        delete settings.aiEnabled;
      }
    }

    const updated = await propertyRepository.updateSettings(id, companyId, settings);
    if (!updated) {
      throw new AppError(404, "Property not found");
    }

    // Keep per-chat AI flags aligned with the property master toggle.
    // - property AI OFF => disable AI for all chats on this property.
    // - property AI ON  => enable AI only for chats not manually assigned.
    if (isPro && settings.aiEnabled !== undefined) {
      if (settings.aiEnabled) {
        await prisma.chat.updateMany({
          where: {
            propertyId: id,
            companyId,
            deletedAt: null,
            agentId: null,
          },
          data: {
            aiEnabled: true,
          },
        });
      } else {
        await prisma.chat.updateMany({
          where: {
            propertyId: id,
            companyId,
            deletedAt: null,
          },
          data: {
            aiEnabled: false,
          },
        });
      }
    }

    let chatbotLogo: string | null = null;
    if (updated.chatbotLogo) {
      try {
        chatbotLogo = await getPresignedUrl(updated.chatbotLogo, companyId, 3600);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
      }
    }

    const property = updated as any; // Type assertion until Prisma client is regenerated
    const effectiveOpenAiChatModelId = resolveEffectiveOpenAiChatModel({
      isPro,
      allowedModelIds: allowedModels,
      propertySelectedModelId: (property.openAiChatModelId ?? null) as string | null,
      envFallback,
    });
    return {
      id: updated.id,
      name: updated.name,
      domain: updated.domain,
      widgetKey: updated.widgetKey,
      createdAt: updated.createdAt,
      chatbotName: updated.chatbotName,
      chatbotLogo,
      launcherButtonColor: updated.launcherButtonColor,
      primaryColor: updated.primaryColor,
      backgroundColor: updated.backgroundColor,
      textColor: updated.textColor,
      leftMessageBackgroundColor: property.leftMessageBackgroundColor,
      leftMessageTextColor: property.leftMessageTextColor,
      rightMessageBackgroundColor: property.rightMessageBackgroundColor,
      rightMessageTextColor: property.rightMessageTextColor,
      welcomeMessage: updated.welcomeMessage,
      position: updated.position,
      aiEnabled: updated.aiEnabled,
      removeBranding: updated.removeBranding,
      openAiChatModelId: property.openAiChatModelId ?? null,
      allowedOpenAiChatModels: allowedModels,
      effectiveOpenAiChatModelId,
    };
  },

  async getSettingsByWidgetKey(widgetKey: string): Promise<(PropertySettingsDTO & {
    isPro?: boolean;
    faqs?: Array<{ id: string; question: string; answer: string }>;
    quickReplies?: Array<{ id: string; label: string; message: string }>;
  }) | null> {
    const property = await propertyRepository.findByWidgetKey(widgetKey);
    if (!property) {
      return null;
    }

    const company = await prisma.company.findUnique({
      where: { id: property.companyId },
      select: { isPro: true },
    });
    const isPro = company?.isPro ?? false;

    let chatbotLogo: string | null = null;
    if (property.chatbotLogo && property.companyId) {
      try {
        chatbotLogo = await getPresignedUrl(property.chatbotLogo, property.companyId, 3600);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
      }
    }

    // Load FAQs and Quick Replies for widget
    const [faqs, quickReplies] = await Promise.all([
      faqRepository.findByPropertyId(property.id, property.companyId, false),
      quickReplyRepository.findByPropertyId(property.id, property.companyId, false),
    ]);

    const prop = property as any; // Type assertion until Prisma client is regenerated
    return {
      chatbotName: property.chatbotName,
      chatbotLogo,
      launcherButtonColor: property.launcherButtonColor,
      primaryColor: property.primaryColor,
      backgroundColor: property.backgroundColor,
      textColor: property.textColor,
      leftMessageBackgroundColor: prop.leftMessageBackgroundColor,
      leftMessageTextColor: prop.leftMessageTextColor,
      rightMessageBackgroundColor: prop.rightMessageBackgroundColor,
      rightMessageTextColor: prop.rightMessageTextColor,
      welcomeMessage: property.welcomeMessage,
      position: property.position,
      removeBranding: property.removeBranding ?? false,
      isPro,
      aiEnabled: property.aiEnabled !== false,
      faqs: faqs.map((faq) => ({
        id: faq.id,
        question: faq.question,
        answer: faq.answer,
      })),
      quickReplies: quickReplies.map((qr) => ({
        id: qr.id,
        label: qr.label,
        message: qr.message,
      })),
    };
  },

  async deleteProperty(companyId: string, id: string, userId?: string, userRole?: string): Promise<void> {
    const existing = await propertyRepository.findById(id, companyId);
    if (!existing) {
      throw new AppError(404, "Property not found");
    }

    if (userRole === "AGENT") {
      throw new AppError(403, "Access denied. Agents cannot delete properties.");
    }

    await prisma.$transaction(async (tx) => {
      const now = new Date();

      const chats = await tx.chat.findMany({
        where: {
          propertyId: id,
          deletedAt: null,
        },
        select: { id: true },
      });
      const chatIds = chats.map((c) => c.id);

      if (chatIds.length > 0) {
        await tx.message.updateMany({
          where: {
            chatId: { in: chatIds },
            deletedAt: null,
          },
          data: { deletedAt: now },
        });

        await tx.chat.updateMany({
          where: {
            id: { in: chatIds },
            deletedAt: null,
          },
          data: { deletedAt: now },
        });
      }

      await tx.property.updateMany({
        where: { id, companyId },
        data: { deletedAt: now },
      });
    });
  },
};
