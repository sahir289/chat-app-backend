import prisma from "../lib/prisma";
import { Role, type SubscriptionStatus } from "@prisma/client";
import { agentAccessService } from "./agentAccessService";

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

        // Use company.isPro as single source of truth for PRO access
        // This is set by super admin when approving upgrade requests
        const isPro = user.company.isPro;

        const isFreeModule = FREE_MODULES.includes(module);

        // For FREE companies, always return the upgrade message for PRO-only modules.
        // This avoids showing "disabled by admin" for modules they are not entitled to use.
        if (!isPro && !isFreeModule) {
            return { allowed: false, reason: "Module requires PRO access. Please upgrade to Pro." };
        }

        // Check if module is disabled by admin (overrides everything except Super Admin)
        // Free modules should remain accessible for FREE companies.
        const moduleFlag = user.company.featureFlags.find((f) => f.feature === module);
        if (moduleFlag && !moduleFlag.enabled) {
            return {
                allowed: false,
                reason: "Module has been disabled by Super Admin",
                disabledByAdmin: true,
            };
        }

        // If PRO, allow all modules (unless disabled above)
        if (isPro) {
            // Check user role restrictions
            if (user.role === Role.AGENT) {
                // Chats, messages, and attachments (file upload in chat) are always allowed for agents
                if (module === "chats" || module === "messages" || module === "attachments") {
                    return { allowed: true };
                }

                // For PRO companies, check agent-specific module access
                const agentModuleMap: Record<
                    string,
                    | "leads"
                    | "analytics"
                    | "properties"
                    | "knowledge_base"
                    | "visitors"
                    | "company"
                    | "billing"
                    | "settings"
                > = {
                    leads: "leads",
                    analytics: "analytics",
                    properties: "properties",
                    knowledge_base: "knowledge_base",
                    visitors: "visitors",
                    company: "company",
                    billing: "billing",
                    account: "settings",
                };

                const agentModule = agentModuleMap[module];
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
            if (module === "chats" || module === "messages" || module === "attachments") {
                return { allowed: true };
            }

            // For FREE companies, check agent-specific module access if admin has granted it
            const agentModuleMap: Record<
                string,
                | "leads"
                | "analytics"
                | "properties"
                | "knowledge_base"
                | "visitors"
                | "company"
                | "billing"
                | "settings"
            > = {
                leads: "leads",
                analytics: "analytics",
                properties: "properties",
                knowledge_base: "knowledge_base",
                visitors: "visitors",
                company: "company",
                billing: "billing",
                account: "settings",
            };

            const agentModule = agentModuleMap[module];
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

        // Use company.isPro as single source of truth
        const isPro = user.company.isPro;
        const featureFlags = (user.company.featureFlags || []) as Array<{ feature: string; enabled: boolean }>;

        const access: Record<ModuleName, boolean> = {} as Record<ModuleName, boolean>;
        const modules = getAllModules();

        // Agent role restrictions
        const isAgent = user.role === Role.AGENT;
        // Agent modules allowed for FREE companies
        const agentModules = new Set<ModuleName>(["chats", "messages", "leads", "analytics"]);

        for (const module of modules) {
            // Check if module is disabled by admin (overrides everything except Super Admin)
            // BUT: Free modules should always be allowed for free companies, even if disabled
            const moduleFlag = featureFlags.find((f: { feature: string }) => f.feature === module);
            const isFreeModule = FREE_MODULES.includes(module);
            if (moduleFlag && !moduleFlag.enabled) {
                // Only block if it's a PRO-only module, or if company is PRO
                // Free modules should always be accessible to free companies
                if (isPro || !isFreeModule) {
                    access[module] = false;
                    continue;
                }
                // For free modules in free companies, ignore the disabled flag and continue
            }

            // If PRO, allow all modules (unless disabled above)
            if (isPro) {
                // Check user role restrictions
                if (isAgent) {
                    // Chats, messages, and attachments are always allowed for agents
                    if (module === "chats" || module === "messages" || module === "attachments") {
                        access[module] = true;
                        continue;
                    }

                    // For PRO companies, check agent-specific module access
                    const agentModuleMap: Record<
                        string,
                        | "leads"
                        | "analytics"
                        | "properties"
                        | "knowledge_base"
                        | "visitors"
                        | "company"
                        | "billing"
                        | "settings"
                    > = {
                        leads: "leads",
                        analytics: "analytics",
                        properties: "properties",
                        knowledge_base: "knowledge_base",
                        visitors: "visitors",
                        company: "company",
                        billing: "billing",
                        account: "settings",
                    };

                    const agentModule = agentModuleMap[module];
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
                if (module === "chats" || module === "messages" || module === "attachments") {
                    access[module] = true;
                    continue;
                }

                // For FREE companies, check agent-specific module access if admin has granted it
                const agentModuleMap: Record<
                    string,
                    | "leads"
                    | "analytics"
                    | "properties"
                    | "knowledge_base"
                    | "visitors"
                    | "company"
                    | "billing"
                    | "settings"
                > = {
                    leads: "leads",
                    analytics: "analytics",
                    properties: "properties",
                    knowledge_base: "knowledge_base",
                    visitors: "visitors",
                    company: "company",
                    billing: "billing",
                    account: "settings",
                };

                const agentModule = agentModuleMap[module];
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
            planTier: string | null;
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
                    status: "ACTIVE",
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

        // Use company.isPro as single source of truth
        // This value is set by super admin when approving upgrade requests
        const isPro = user.company.isPro;
        const featureFlags = (user.company.featureFlags || []) as Array<{ feature: string; enabled: boolean }>;
        const disabledModules = featureFlags
            .filter((f: { enabled: boolean; feature: string }) => !f.enabled)
            .map((f: { feature: string }) => f.feature as ModuleName);

        const modules = await this.getUserModuleAccess(userId);

        return {
            modules,
            subscription: {
                status: "ACTIVE", // Always active in simplified model
                planTier: null, // Do not return or use planTier - use isPro instead
                isActive: true,
            },
            disabledModules,
            isPro, // Single source of truth for PRO access
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

