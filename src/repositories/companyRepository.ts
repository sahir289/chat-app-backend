import prisma from "../lib/prisma";
import { Role } from "@prisma/client";
import type { Company, Prisma } from "@prisma/client";

function getInitialAiCreditsResetAt(): Date {
    const nextResetAt = new Date();
    nextResetAt.setMonth(nextResetAt.getMonth() + 1);
    return nextResetAt;
}

export const companyRepository = {
    async findById(id: string) {
        return prisma.company.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                slug: true,
                email: true,
                phone: true,
                logo: true,
                createdBySuperAdminId: true,
                isActive: true,
                isSuspended: true,
                suspensionReason: true,
                isPro: true,
                allowedOpenAiChatModels: true,
                aiCreditsMonthlyBase: true,
                aiCreditsMonthlyManualOverride: true,
                aiCreditsUsed: true,
                aiCreditsRemaining: true,
                aiCreditsResetAt: true,
                aiStatus: true,
                aiTokensPerCredit: true,
                aiTokensPerCreditManualOverride: true,
                aiPromptTokensUsed: true,
                aiCompletionTokensUsed: true,
                aiTotalTokensUsed: true,
                aiMonthlyPromptTokensUsed: true,
                aiMonthlyCompletionTokensUsed: true,
                aiMonthlyTokensUsed: true,
                hasUsedFreeExport: true,
                createdAt: true,
                updatedAt: true,
                deletedAt: true,
            },
        });
    },

    async findBySlug(slug: string): Promise<Omit<Company, 'logo'> | null> {
        return prisma.company.findUnique({
            where: { slug },
            select: {
                id: true,
                name: true,
                slug: true,
                email: true,
                phone: true,
                createdBySuperAdminId: true,
                isActive: true,
                isSuspended: true,
                suspensionReason: true,
                isPro: true,
                allowedOpenAiChatModels: true,
                aiCreditsMonthlyBase: true,
                aiCreditsMonthlyManualOverride: true,
                aiCreditsUsed: true,
                aiCreditsRemaining: true,
                aiCreditsResetAt: true,
                aiStatus: true,
                aiTokensPerCredit: true,
                aiTokensPerCreditManualOverride: true,
                aiPromptTokensUsed: true,
                aiCompletionTokensUsed: true,
                aiTotalTokensUsed: true,
                aiMonthlyPromptTokensUsed: true,
                aiMonthlyCompletionTokensUsed: true,
                aiMonthlyTokensUsed: true,
                hasUsedFreeExport: true,
                createdAt: true,
                updatedAt: true,
                deletedAt: true,
            },
        }) as Promise<Omit<Company, 'logo'> | null>;
    },

    async create(data: {
        name: string;
        email?: string | null;
        phone?: string | null;
        slug?: string | null;
        createdBySuperAdminId?: string | null;
        isActive?: boolean;
        isSuspended?: boolean;
        isPro?: boolean;
        aiCreditsMonthlyBase?: number;
        aiCreditsUsed?: number;
        aiCreditsResetAt?: Date;
        aiStatus?: "ACTIVE" | "LIMIT_REACHED";
    }): Promise<Omit<Company, 'logo'>> {
        return prisma.company.create({
            data: {
                name: data.name.trim(),
                email: data.email?.trim().toLowerCase() || null,
                phone: data.phone?.trim() || null,
                slug: data.slug?.trim() || null,
                createdBySuperAdminId: data.createdBySuperAdminId || null,
                isActive: data.isActive ?? true,
                isSuspended: data.isSuspended ?? false,
                isPro: data.isPro ?? false,
                aiCreditsMonthlyBase: data.aiCreditsMonthlyBase ?? 0,
                aiCreditsUsed: data.aiCreditsUsed ?? 0,
                aiCreditsRemaining: 0,
                aiCreditsResetAt: data.aiCreditsResetAt ?? getInitialAiCreditsResetAt(),
                aiStatus: data.aiStatus ?? "ACTIVE",
            },
            select: {
                id: true,
                name: true,
                slug: true,
                email: true,
                phone: true,
                createdBySuperAdminId: true,
                isActive: true,
                isSuspended: true,
                suspensionReason: true,
                isPro: true,
                allowedOpenAiChatModels: true,
                aiCreditsMonthlyBase: true,
                aiCreditsMonthlyManualOverride: true,
                aiCreditsUsed: true,
                aiCreditsRemaining: true,
                aiCreditsResetAt: true,
                aiStatus: true,
                aiTokensPerCredit: true,
                aiTokensPerCreditManualOverride: true,
                aiPromptTokensUsed: true,
                aiCompletionTokensUsed: true,
                aiTotalTokensUsed: true,
                aiMonthlyPromptTokensUsed: true,
                aiMonthlyCompletionTokensUsed: true,
                aiMonthlyTokensUsed: true,
                hasUsedFreeExport: true,
                crmLeadSyncPreferences: true,
                createdAt: true,
                updatedAt: true,
                deletedAt: true,
            } as Prisma.CompanySelect,
        }) as Promise<Omit<Company, 'logo'>>;
    },

    async update(
        id: string,
        data: {
            name?: string;
            email?: string | null;
            phone?: string | null;
            logo?: string | null;
            isActive?: boolean;
            isSuspended?: boolean;
            suspensionReason?: string | null;
            isPro?: boolean;
            hasUsedFreeExport?: boolean;
            deletedAt?: Date | null;
            allowedOpenAiChatModels?: string[];
            aiCreditsMonthlyBase?: number;
            aiCreditsUsed?: number;
            aiCreditsResetAt?: Date;
            aiStatus?: "ACTIVE" | "LIMIT_REACHED";
        }
    ) {
        const updateData: Prisma.CompanyUpdateInput = {};

        if (data.name !== undefined) {
            updateData.name = data.name.trim();
        }
        if (data.email !== undefined) {
            updateData.email = data.email?.trim().toLowerCase() || null;
        }
        if (data.phone !== undefined) {
            updateData.phone = data.phone?.trim() || null;
        }
        if (data.logo !== undefined) {
            updateData.logo = data.logo || null;
        }
        if (data.isActive !== undefined) {
            updateData.isActive = data.isActive;
        }
        if (data.isSuspended !== undefined) {
            updateData.isSuspended = data.isSuspended;
        }
        if (data.suspensionReason !== undefined) {
            updateData.suspensionReason = data.suspensionReason?.trim() || null;
        }
        if (data.isPro !== undefined) {
            updateData.isPro = data.isPro;
        }
        if (data.hasUsedFreeExport !== undefined) {
            updateData.hasUsedFreeExport = data.hasUsedFreeExport;
        }
        if (data.deletedAt !== undefined) {
            updateData.deletedAt = data.deletedAt;
        }
        if (data.allowedOpenAiChatModels !== undefined) {
            updateData.allowedOpenAiChatModels = { set: data.allowedOpenAiChatModels };
        }
        if (data.aiCreditsMonthlyBase !== undefined) {
            updateData.aiCreditsMonthlyBase = data.aiCreditsMonthlyBase;
        }
        if (data.aiCreditsUsed !== undefined) {
            updateData.aiCreditsUsed = data.aiCreditsUsed;
        }
        if (data.aiCreditsResetAt !== undefined) {
            updateData.aiCreditsResetAt = data.aiCreditsResetAt;
        }
        if (data.aiStatus !== undefined) {
            updateData.aiStatus = data.aiStatus;
        }

        return prisma.company.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                name: true,
                slug: true,
                email: true,
                phone: true,
                logo: true,
                createdBySuperAdminId: true,
                isActive: true,
                isSuspended: true,
                suspensionReason: true,
                isPro: true,
                allowedOpenAiChatModels: true,
                aiCreditsMonthlyBase: true,
                aiCreditsMonthlyManualOverride: true,
                aiCreditsUsed: true,
                aiCreditsRemaining: true,
                aiCreditsResetAt: true,
                aiStatus: true,
                aiTokensPerCredit: true,
                aiTokensPerCreditManualOverride: true,
                aiPromptTokensUsed: true,
                aiCompletionTokensUsed: true,
                aiTotalTokensUsed: true,
                aiMonthlyPromptTokensUsed: true,
                aiMonthlyCompletionTokensUsed: true,
                aiMonthlyTokensUsed: true,
                hasUsedFreeExport: true,
                createdAt: true,
                updatedAt: true,
                deletedAt: true,
            },
        });
    },

    async findByIdWithCounts(id: string): Promise<Company & {
        _count: {
            properties: number;
            users: number;
            leads: number;
        };
    } | null> {
        return prisma.company.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                slug: true,
                isActive: true,
                isSuspended: true,
                suspensionReason: true,
                isPro: true,
                allowedOpenAiChatModels: true,
                aiCreditsMonthlyBase: true,
                aiCreditsMonthlyManualOverride: true,
                aiCreditsUsed: true,
                aiCreditsRemaining: true,
                aiCreditsResetAt: true,
                aiStatus: true,
                aiTokensPerCredit: true,
                aiTokensPerCreditManualOverride: true,
                aiPromptTokensUsed: true,
                aiCompletionTokensUsed: true,
                aiTotalTokensUsed: true,
                aiMonthlyPromptTokensUsed: true,
                aiMonthlyCompletionTokensUsed: true,
                aiMonthlyTokensUsed: true,
                createdAt: true,
                updatedAt: true,
                deletedAt: true,
                _count: {
                    select: {
                        properties: true,
                        users: true,
                        leads: true,
                    },
                },
            },
        }) as Promise<Company & {
            _count: {
                properties: number;
                users: number;
                leads: number;
            };
        } | null>;
    },

    async findByIdWithUsers(id: string): Promise<Company & {
        users: Array<{
            id: string;
            name: string | null;
            email: string;
            role: string;
            isActive: boolean;
            emailVerified: boolean;
            deletedAt: Date | null;
            createdAt: Date;
        }>;
    } | null> {
        return prisma.company.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                slug: true,
                isActive: true,
                isSuspended: true,
                suspensionReason: true,
                isPro: true,
                aiCreditsMonthlyBase: true,
                aiCreditsMonthlyManualOverride: true,
                aiCreditsUsed: true,
                aiCreditsRemaining: true,
                aiCreditsResetAt: true,
                aiStatus: true,
                aiTokensPerCredit: true,
                aiTokensPerCreditManualOverride: true,
                aiPromptTokensUsed: true,
                aiCompletionTokensUsed: true,
                aiTotalTokensUsed: true,
                aiMonthlyPromptTokensUsed: true,
                aiMonthlyCompletionTokensUsed: true,
                aiMonthlyTokensUsed: true,
                createdAt: true,
                updatedAt: true,
                deletedAt: true,
                users: {
                    where: {
                        isSuperAdmin: false,
                    },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                        isActive: true,
                        emailVerified: true,
                        deletedAt: true,
                        createdAt: true,
                    },
                    orderBy: { createdAt: "desc" },
                },
            },
        }) as Promise<Company & {
            users: Array<{
                id: string;
                name: string | null;
                email: string;
                role: string;
                isActive: boolean;
                emailVerified: boolean;
                deletedAt: Date | null;
                createdAt: Date;
            }>;
        } | null>;
    },

    async findByIdWithProperties(id: string): Promise<Company & {
        properties: Array<{
            id: string;
            name: string;
            domain: string | null;
            createdAt: Date;
        }>;
    } | null> {
        return prisma.company.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                slug: true,
                isActive: true,
                isSuspended: true,
                suspensionReason: true,
                isPro: true,
                aiCreditsMonthlyBase: true,
                aiCreditsMonthlyManualOverride: true,
                aiCreditsUsed: true,
                aiCreditsRemaining: true,
                aiCreditsResetAt: true,
                aiStatus: true,
                aiTokensPerCredit: true,
                aiTokensPerCreditManualOverride: true,
                aiPromptTokensUsed: true,
                aiCompletionTokensUsed: true,
                aiTotalTokensUsed: true,
                aiMonthlyPromptTokensUsed: true,
                aiMonthlyCompletionTokensUsed: true,
                aiMonthlyTokensUsed: true,
                createdAt: true,
                updatedAt: true,
                properties: {
                    select: {
                        id: true,
                        name: true,
                        domain: true,
                        createdAt: true,
                    },
                    orderBy: { createdAt: "desc" },
                },
            },
        }) as Promise<Company & {
            properties: Array<{
                id: string;
                name: string;
                domain: string | null;
                createdAt: Date;
            }>;
        } | null>;
    },

    async count(where?: Prisma.CompanyWhereInput): Promise<number> {
        return prisma.company.count({ where });
    },

    async listAll(
        page: number = 1,
        limit: number = 50,
        search?: string,
        statusFilter?: "all" | "active" | "suspended" | "inactive" | "archived",
        planFilter?: "all" | "pro" | "free"
    ): Promise<{
        companies: Array<{
            id: string;
            name: string;
            email: string | null;
            phone: string | null;
            slug: string | null;
            isActive: boolean;
            isSuspended: boolean;
            suspensionReason: string | null;
            isPro: boolean;
            createdAt: Date;
            updatedAt: Date;
            deletedAt: Date | null;
            ownerEmail: string | null;
            ownerName: string | null;
        }>;
        total: number;
    }> {
        const skip = (page - 1) * limit;

        const where: Prisma.CompanyWhereInput = statusFilter === "archived"
            ? {}
            : { deletedAt: null };

        // Build search condition
        const searchConditions: Prisma.CompanyWhereInput[] = [];
        if (search?.trim()) {
            searchConditions.push({
                OR: [
                    { name: { contains: search.trim(), mode: "insensitive" } },
                    { email: { contains: search.trim(), mode: "insensitive" } },
                    {
                        users: {
                            some: {
                                isOwner: true,
                                email: { contains: search.trim(), mode: "insensitive" },
                            },
                        },
                    },
                ],
            });
        }

        // Build status filter condition
        const statusConditions: Prisma.CompanyWhereInput[] = [];
        if (statusFilter && statusFilter !== "all") {
            if (statusFilter === "active") {
                // Active: isActive = true, isSuspended = false, and has active users with verified emails
                statusConditions.push({
                    deletedAt: null,
                    isActive: true,
                    isSuspended: false,
                    users: {
                        some: {
                            deletedAt: null,
                            isActive: true,
                            emailVerified: true,
                        },
                    },
                });
            } else if (statusFilter === "suspended") {
                // Suspended: isSuspended = true
                statusConditions.push({
                    deletedAt: null,
                    isSuspended: true,
                });
            } else if (statusFilter === "archived") {
                // Archived: company account was soft-deleted after active users were deleted.
                statusConditions.push({
                    deletedAt: { not: null },
                });
            } else if (statusFilter === "inactive") {
                // Inactive: isActive = false OR no active users with verified emails
                statusConditions.push({
                    deletedAt: null,
                    isSuspended: false,
                    OR: [
                        { isActive: false },
                        {
                            users: {
                                none: {
                                    deletedAt: null,
                                    isActive: true,
                                    emailVerified: true,
                                },
                            },
                        },
                    ],
                });
            }
        }

        // Build plan filter condition
        const planConditions: Prisma.CompanyWhereInput[] = [];
        if (planFilter && planFilter !== "all") {
            if (planFilter === "pro") {
                planConditions.push({ isPro: true });
            } else if (planFilter === "free") {
                planConditions.push({ isPro: false });
            }
        }

        // Combine all conditions with AND
        const allConditions = [...searchConditions, ...statusConditions, ...planConditions];
        if (allConditions.length > 0) {
            if (allConditions.length === 1) {
                Object.assign(where, allConditions[0]);
            } else {
                where.AND = allConditions;
            }
        }

        const [companies, total] = await Promise.all([
            prisma.company.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    slug: true,
                    isActive: true,
                    isSuspended: true,
                    suspensionReason: true,
                    isPro: true,
                    aiCreditsMonthlyBase: true,
                    aiCreditsMonthlyManualOverride: true,
                    aiCreditsUsed: true,
                    aiCreditsRemaining: true,
                    aiCreditsResetAt: true,
                    aiStatus: true,
                    aiTokensPerCredit: true,
                    aiTokensPerCreditManualOverride: true,
                    aiPromptTokensUsed: true,
                    aiCompletionTokensUsed: true,
                    aiTotalTokensUsed: true,
                    aiMonthlyPromptTokensUsed: true,
                    aiMonthlyCompletionTokensUsed: true,
                    aiMonthlyTokensUsed: true,
                    createdAt: true,
                    updatedAt: true,
                    deletedAt: true,
                    users: {
                        where: {
                            isOwner: true,
                        },
                        select: {
                            email: true,
                            name: true,
                            deletedAt: true,
                        },
                        orderBy: { deletedAt: "desc" },
                        take: 1,
                    },
                    _count: {
                        select: {
                            users: {
                                where: {
                                    deletedAt: null,
                                    isActive: true,
                                    emailVerified: true,
                                },
                            },
                        },
                    },
                },
            }),
            prisma.company.count({ where }),
        ]);

        // Query active admin/owner users for all companies in the result
        const companyIds = companies.map((c) => c.id);
        const activeAdminUsers = companyIds.length > 0
            ? await prisma.user.findMany({
                where: {
                    companyId: { in: companyIds },
                    deletedAt: null,
                    isActive: true,
                    emailVerified: true,
                    OR: [
                        { isOwner: true },
                        { role: Role.ADMIN },
                    ],
                },
                select: {
                    companyId: true,
                },
            })
            : [];

        // Create a map of companyId -> hasActiveAdmin
        const companyHasActiveAdmin = new Set(
            activeAdminUsers.map((user) => user.companyId).filter((id): id is string => id !== null)
        );

        const companiesWithOwner = companies.map((company) => {
            const { users, _count, ...companyData } = company;
            // Company is effectively inactive if it has no active users with verified emails, 
            // or if the admin/owner account is deleted/inactive, even if isActive is true
            const hasActiveUsers = _count.users > 0;
            const hasActiveAdmin = companyHasActiveAdmin.has(company.id);
            const effectiveIsActive = companyData.deletedAt === null && companyData.isActive && hasActiveUsers && hasActiveAdmin;
            
            return {
                ...companyData,
                isActive: effectiveIsActive, // Override with computed status
                ownerEmail: users[0]?.email || null,
                ownerName: users[0]?.name || null,
            };
        });

        return {
            companies: companiesWithOwner,
            total,
        };
    },
};

