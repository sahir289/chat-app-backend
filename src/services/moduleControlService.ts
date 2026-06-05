import { featureFlagRepository } from "../repositories/featureFlagRepository";
import { AppError } from "../utils/appError";
import prisma from "../lib/prisma";
import type { ModuleName } from "./moduleAccessService";
import { FREE_MODULES } from "./moduleAccessService";
// Helper to get all modules
function getAllModules(): ModuleName[] {
  return [
    "chats",
    "messages",
    "leads",
    "properties",
    "analytics",
    "team",
    "company",
    "billing",
    "account",
    "attachments",
    "chat_ratings",
    "chat_notes",
    "tags",
    "canned_responses",
    "api_keys",
    "webhooks",
    "departments",
    "assignment_rules",
    "custom_fields",
    "sla_management",
    "integrations",
    "feature_flags",
    "proactive_triggers",
    "automation_workflows",
    "visitor_segments",
    "knowledge_base",
    "subscriptions",
    "visitors",
  ];
}

export const moduleControlService = {
  async enableModule(companyId: string, module: ModuleName, superAdminId: string, reason?: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new AppError(404, "Company not found");
    }

    const flag = await featureFlagRepository.setModuleEnabled(companyId, module, true);

    await this.logAudit(superAdminId, "COMPANY", companyId, {
      action: "ENABLE_MODULE",
      module,
      reason,
    });

    return flag;
  },

  async disableModule(companyId: string, module: ModuleName, superAdminId: string, reason?: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new AppError(404, "Company not found");
    }

    const flag = await featureFlagRepository.setModuleEnabled(companyId, module, false);

    await this.logAudit(superAdminId, "COMPANY", companyId, {
      action: "DISABLE_MODULE",
      module,
      reason,
    });

    return flag;
  },

  async getCompanyModules(companyId: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, isPro: true },
    });

    if (!company) {
      throw new AppError(404, "Company not found");
    }

    const flags = await featureFlagRepository.findByCompanyId(companyId);
    const flagMap = Object.fromEntries(
      flags.map((f) => [f.feature, f.enabled])
    ) as Record<string, boolean>;

    const allModules = getAllModules();
    const modules = allModules.map((module) => {
      const flag = flagMap[module];
      // If flag exists, use it; otherwise, determine default based on isPro
      const isEnabled = flag ?? (company.isPro ? true : FREE_MODULES.includes(module));

      return {
        moduleKey: module,
        isEnabled,
        isOverridden: flag !== undefined, // Whether Super Admin has explicitly set this
      };
    });

    return {
      companyId,
      isPro: company.isPro,
      modules,
    };
  },

  async setMultipleModules(
    companyId: string,
    modules: { module: ModuleName; enabled: boolean }[],
    superAdminId: string,
    reason?: string
  ) {
    const results = await Promise.all(
      modules.map(({ module, enabled }) =>
        featureFlagRepository.setModuleEnabled(companyId, module, enabled)
      )
    );

    await this.logAudit(superAdminId, "COMPANY", companyId, {
      action: "BULK_UPDATE_MODULES",
      modules: modules.map((m) => ({ module: m.module, enabled: m.enabled })),
      reason,
    });

    return results;
  },

  async enableAllModules(companyId: string, superAdminId: string, reason?: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new AppError(404, "Company not found");
    }

    const allModules = getAllModules();
    const results = await Promise.all(
      allModules.map((module) =>
        featureFlagRepository.setModuleEnabled(companyId, module, true)
      )
    );

    await this.logAudit(superAdminId, "COMPANY", companyId, {
      action: "ENABLE_ALL_MODULES",
      reason,
    });

    return results;
  },

  async disableAllModules(companyId: string, superAdminId: string, reason?: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new AppError(404, "Company not found");
    }

    const allModules = getAllModules();
    const results = await Promise.all(
      allModules.map((module) =>
        featureFlagRepository.setModuleEnabled(companyId, module, false)
      )
    );

    await this.logAudit(superAdminId, "COMPANY", companyId, {
      action: "DISABLE_ALL_MODULES",
      reason,
    });

    return results;
  },

  /**
   * Set modules for FREE plan: Enable FREE modules, disable PRO modules
   */
  async setFreePlanModules(companyId: string, superAdminId: string, reason?: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new AppError(404, "Company not found");
    }

    const allModules = getAllModules();
    const results = await Promise.all(
      allModules.map((module) => {
        const isFreeModule = FREE_MODULES.includes(module);
        return featureFlagRepository.setModuleEnabled(companyId, module, isFreeModule);
      })
    );

    await this.logAudit(superAdminId, "COMPANY", companyId, {
      action: "SET_FREE_PLAN_MODULES",
      reason,
    });

    return results;
  },

  async logAudit(userId: string, resourceType: string, resourceId: string, metadata: any) {
    try {
      await prisma.auditLog.create({
        data: {
          userId,
          resourceType: resourceType as any,
          resourceId,
          action: "UPDATE",
          metadata: metadata as any,
          ipAddress: null,
          userAgent: null,
          companyId: resourceType === "COMPANY" ? resourceId : null,
        },
      });
    } catch (error) {
    }
  },
};

