import prisma from "../lib/prisma";
import { Role, SubscriptionStatus, type PlanTier } from "@prisma/client";
import { agentAccessService } from "./agentAccessService";
import {
    resolveSubscriptionAccess,
    subscriptionAccessSelect,
    subscriptionService,
} from "./subscriptionService";

export type ModuleName =
    | "chats"
    | "messages"
    | "leads"
    | "properties"
    | "analytics"
    | "team"
    | "company"
    | "billing"
    | "account"
    | "attachments"
    | "chat_ratings"
    | "chat_notes"
    | "tags"
    | "canned_responses"
    | "api_keys"
    | "webhooks"
    | "departments"
    | "assignment_rules"
    | "custom_fields"
    | "sla_management"
    | "integrations"
    | "feature_flags"
    | "proactive_triggers"
    | "automation_workflows"
    | "visitor_segments"
    | "knowledge_base"
    | "subscriptions"
    | "visitors";

const ALL_MODULES: ModuleName[] = [
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

// FREE modules available to all users
export const FREE_MODULES: ModuleName[] = [
    "chats",
    "messages",
    "leads",
    "properties",
    "analytics",
    "team",
    "company",
    "billing",
    "account",
    "visitors",
    "subscriptions",
];

type AgentAccessModule =
    | "leads"
    | "analytics"
    | "properties"
    | "knowledge_base"
    | "visitors"
    | "company"
    | "billing"
    | "settings";

const AGENT_CORE_MODULES = new Set<ModuleName>(["chats", "messages", "attachments"]);

const AGENT_MODULE_ACCESS_MAP: Partial<Record<ModuleName, AgentAccessModule>> = {
    leads: "leads",
    analytics: "analytics",
    properties: "properties",
    knowledge_base: "knowledge_base",
    visitors: "visitors",
    company: "company",
    billing: "billing",
    account: "settings",
};

// Helper to get all modules
function getAllModules(): ModuleName[] {
    return [...ALL_MODULES];
}

export const moduleAccessService = {
    async checkModuleAccess(
        userId: string,
        module: ModuleName
    ): Promise<{ allowed: boolean; reason?: string; disabledByAdmin?: boolean }> {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                company: {
                    select: {
                        id: true,
                        isPro: true,
                        featureFlags: {
                            where: {
                                feature: module,
                            },
                        },
                        subscriptions: {
                            orderBy: { createdAt: "desc" },
                            take: 1,
                            select: subscriptionAccessSelect,
                        },
                    },
                },
            },
        });

        if (!user) {
            return { allowed: false, reason: "User not found" };
        }

        // Access check order:
        // 1. Super Admin → always allowed
        // 2. If module is disabled → block access
        // 3. Else check company.isPro rules
        // 4. Then check user role (Admin / Agent)

        if (user.isSuperAdmin || user.role === Role.SUPER_ADMIN) {
            return { allowed: true };
        }

        if (!user.company) {
            return { allowed: false, reason: "No company found" };
        }

        const downgraded = await subscriptionService.ensureCompanyPlanMatchesSubscription(user.company.id);
        if (downgraded) {
            user.company.isPro = false;
        }

        const subscriptionAccess = resolveSubscriptionAccess({
            isPro: user.company.isPro,
            subscription: user.company.subscriptions[0] ?? null,
        });
        const hasActiveProAccess = subscriptionAccess.canAccessPaidFeatures;

        const isFreeModule = FREE_MODULES.includes(module);

        // For FREE companies, always return the upgrade message for PRO-only modules.
        // This avoids showing "disabled by admin" for modules they are not entitled to use.
        if (!hasActiveProAccess && !isFreeModule) {
            return {
                allowed: false,
                reason: subscriptionAccess.reason || "Module requires active PRO access. Please upgrade to Pro.",
            };
        }

        // Check if module is disabled by admin (overrides everything except Super Admin)
        // Free modules should remain accessible for FREE companies.
        const moduleFlag = user.company.featureFlags.find((f) => f.feature === module);
        if (moduleFlag && !moduleFlag.enabled && (hasActiveProAccess || !isFreeModule)) {
            return {
                allowed: false,
                reason: "Module has been disabled by Super Admin",
                disabledByAdmin: true,
            };
        }

        // If PRO, allow all modules (unless disabled above)
        if (hasActiveProAccess) {
            // Check user role restrictions
            if (user.role === Role.AGENT) {
                // Chats, messages, and attachments (file upload in chat) are always allowed for agents
                if (AGENT_CORE_MODULES.has(module)) {
                    return { allowed: true };
                }

                // For PRO companies, check agent-specific module access
                const agentModule = AGENT_MODULE_ACCESS_MAP[module];
                if (agentModule) {
                    const hasAccess = await agentAccessService.checkAgentModuleAccess(user.id, agentModule);
                    if (!hasAccess) {
                        return { allowed: false, reason: "Module access not granted by admin" };
                    }
                    return { allowed: true };
                }

                // All other modules are not allowed for agents
                return { allowed: false, reason: "Module not available for agents" };
            }
            return { allowed: true };
        }

        // If FREE, only allow FREE modules (PRO-only already handled above)

        // Check user role restrictions for FREE modules
        if (user.role === Role.AGENT) {
            // Chats, messages, and attachments (file upload in chat) are always allowed for agents
            if (AGENT_CORE_MODULES.has(module)) {
                return { allowed: true };
            }

            // For FREE companies, check agent-specific module access if admin has granted it
            const agentModule = AGENT_MODULE_ACCESS_MAP[module];
            if (agentModule) {
                const hasAccess = await agentAccessService.checkAgentModuleAccess(user.id, agentModule);
                if (hasAccess) {
                    return { allowed: true };
                }
                return { allowed: false, reason: "Module access not granted by admin" };
            }

            // All other modules are not allowed for agents
            return { allowed: false, reason: "Module not available for agents" };
        }

        return { allowed: true };
    },

    async getUserModuleAccess(userId: string): Promise<Record<ModuleName, boolean>> {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                company: {
                    select: {
                        id: true,
                        isPro: true,
                        featureFlags: true,
                        subscriptions: {
                            orderBy: { createdAt: "desc" },
                            take: 1,
                            select: subscriptionAccessSelect,
                        },
                    },
                },
            },
        });

        if (!user) {
            return this.getAllModulesDenied();
        }

        if (user.isSuperAdmin || user.role === Role.SUPER_ADMIN) {
            return this.getAllModulesAllowed();
        }

        if (!user.company) {
            return this.getAllModulesDenied();
        }

        const downgraded = await subscriptionService.ensureCompanyPlanMatchesSubscription(user.company.id);
        if (downgraded) {
            user.company.isPro = false;
        }

        const subscriptionAccess = resolveSubscriptionAccess({
            isPro: user.company.isPro,
            subscription: user.company.subscriptions[0] ?? null,
        });
        const hasActiveProAccess = subscriptionAccess.canAccessPaidFeatures;
        const featureFlags = (user.company.featureFlags || []) as Array<{ feature: string; enabled: boolean }>;

        const access: Record<ModuleName, boolean> = {} as Record<ModuleName, boolean>;
        const modules = getAllModules();

        // Agent role restrictions
        const isAgent = user.role === Role.AGENT;

        for (const module of modules) {
            // Check if module is disabled by admin (overrides everything except Super Admin)
            // BUT: Free modules should always be allowed for free companies, even if disabled
            const moduleFlag = featureFlags.find((f: { feature: string }) => f.feature === module);
            const isFreeModule = FREE_MODULES.includes(module);
            if (moduleFlag && !moduleFlag.enabled) {
                // Only block if it's a PRO-only module, or if company is PRO
                // Free modules should always be accessible to free companies
                if (hasActiveProAccess || !isFreeModule) {
                    access[module] = false;
                    continue;
                }
                // For free modules in free companies, ignore the disabled flag and continue
            }

            // If PRO, allow all modules (unless disabled above)
            if (hasActiveProAccess) {
                // Check user role restrictions
                if (isAgent) {
                    // Chats, messages, and attachments are always allowed for agents
                    if (AGENT_CORE_MODULES.has(module)) {
                        access[module] = true;
                        continue;
                    }

                    // For PRO companies, check agent-specific module access
                    const agentModule = AGENT_MODULE_ACCESS_MAP[module];
                    if (agentModule) {
                        const hasAccess = await agentAccessService.checkAgentModuleAccess(user.id, agentModule);
                        access[module] = hasAccess;
                        continue;
                    }

                    // All other modules are not allowed for agents
                    access[module] = false;
                    continue;
                }
                access[module] = true;
                continue;
            }

            // If FREE, only allow FREE modules
            if (!FREE_MODULES.includes(module)) {
                access[module] = false;
                continue;
            }

            // Check user role restrictions for FREE modules
            if (isAgent) {
                // Chats, messages, and attachments are always allowed for agents
                if (AGENT_CORE_MODULES.has(module)) {
                    access[module] = true;
                    continue;
                }

                // For FREE companies, check agent-specific module access if admin has granted it
                const agentModule = AGENT_MODULE_ACCESS_MAP[module];
                if (agentModule) {
                    const hasAccess = await agentAccessService.checkAgentModuleAccess(user.id, agentModule);
                    access[module] = hasAccess;
                    continue;
                }

                // All other modules are not allowed for agents
                access[module] = false;
                continue;
            }

            access[module] = true;
        }

        return access;
    },

    async getModuleAccessDetails(userId: string): Promise<{
        modules: Record<ModuleName, boolean>;
        subscription: {
            status: SubscriptionStatus | null;
            planTier: PlanTier | null;
            isActive: boolean;
        };
        disabledModules: ModuleName[];
        isPro: boolean;
    }> {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                company: {
                    select: {
                        id: true,
                        isPro: true,
                        featureFlags: true,
                        subscriptions: {
                            orderBy: { createdAt: "desc" },
                            take: 1,
                            select: subscriptionAccessSelect,
                        },
                    },
                },
            },
        });

        if (!user) {
            return {
                modules: this.getAllModulesDenied(),
                subscription: {
                    status: null,
                    planTier: null,
                    isActive: false,
                },
                disabledModules: [],
                isPro: false,
            };
        }

        if (user.isSuperAdmin || user.role === Role.SUPER_ADMIN) {
            return {
                modules: this.getAllModulesAllowed(),
                subscription: {
                    status: SubscriptionStatus.ACTIVE,
                    planTier: null, // Do not return "PRO" as planTier
                    isActive: true,
                },
                disabledModules: [],
                isPro: true,
            };
        }

        if (!user.company) {
            return {
                modules: this.getAllModulesDenied(),
                subscription: {
                    status: null,
                    planTier: null,
                    isActive: false,
                },
                disabledModules: [],
                isPro: false,
            };
        }

        const downgraded = await subscriptionService.ensureCompanyPlanMatchesSubscription(user.company.id);
        if (downgraded) {
            user.company.isPro = false;
        }

        const subscriptionAccess = resolveSubscriptionAccess({
            isPro: user.company.isPro,
            subscription: user.company.subscriptions[0] ?? null,
        });
        const hasActiveProAccess = subscriptionAccess.canAccessPaidFeatures;
        const featureFlags = (user.company.featureFlags || []) as Array<{ feature: string; enabled: boolean }>;
        const disabledModules = featureFlags
            .filter((f: { enabled: boolean; feature: string }) => !f.enabled)
            .map((f: { feature: string }) => f.feature as ModuleName);

        const modules = await this.getUserModuleAccess(userId);

        return {
            modules,
            subscription: {
                status: subscriptionAccess.status,
                planTier: subscriptionAccess.planTier,
                isActive: subscriptionAccess.isActive,
            },
            disabledModules,
            isPro: hasActiveProAccess,
        };
    },

    getAllModulesAllowed(): Record<ModuleName, boolean> {
        const modules = getAllModules();
        return modules.reduce((acc, module) => {
            acc[module] = true;
            return acc;
        }, {} as Record<ModuleName, boolean>);
    },

    getAllModulesDenied(): Record<ModuleName, boolean> {
        const modules = getAllModules();
        return modules.reduce((acc, module) => {
            acc[module] = false;
            return acc;
        }, {} as Record<ModuleName, boolean>);
    },
};

