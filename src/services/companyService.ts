import { isUserOperationallyActive } from "../helpers/userOperationalStatus";
import { AppError } from "../utils/appError";
import { companyRepository } from "../repositories/companyRepository";
import { userRepository } from "../repositories/userRepository";
import { Prisma, Role } from "@prisma/client";
import { upgradeRequestRepository } from "../repositories/upgradeRequestRepository";
import prisma from "../lib/prisma";
import { sanitizeOpenAiModelIdList } from "../utils/openaiChatModelResolver";
import { subscriptionService } from "./subscriptionService";

type CreateCompanyInput = {
    name: string;
    email?: string | null;
    phone?: string | null;
    slug?: string | null;
    createdBySuperAdminId?: string;
};

type UpdateCompanyInput = {
    name?: string;
    email?: string | null;
    phone?: string | null;
};

type SuspendCompanyInput = {
    suspensionReason?: string;
};

type ArchivedUserSnapshot = {
    id: string;
    role: Role;
    isOwner: boolean;
};

function getArchivedUsersFromAuditMetadata(metadata: Prisma.JsonValue | null): ArchivedUserSnapshot[] {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return [];
    }

    const record = metadata as Record<string, unknown>;
    if (record.action !== "COMPANY_ARCHIVE" || !Array.isArray(record.archivedUsers)) {
        return [];
    }

    return record.archivedUsers.flatMap((entry): ArchivedUserSnapshot[] => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return [];
        }

        const user = entry as Record<string, unknown>;
        const role = user.role;
        if (
            typeof user.id !== "string" ||
            typeof user.isOwner !== "boolean" ||
            (role !== Role.ADMIN && role !== Role.AGENT && role !== Role.SUPER_ADMIN)
        ) {
            return [];
        }

        return [{ id: user.id, role, isOwner: user.isOwner }];
    });
}

async function getLegacyArchiveUserSnapshots(
    tx: Prisma.TransactionClient,
    companyId: string,
    archivedAt: Date
): Promise<ArchivedUserSnapshot[]> {
    const archiveWindowMs = 10_000;
    const windowStart = new Date(archivedAt.getTime() - archiveWindowMs);
    const windowEnd = new Date(archivedAt.getTime() + archiveWindowMs);

    const users = await tx.user.findMany({
        where: {
            companyId,
            deletedAt: {
                gte: windowStart,
                lte: windowEnd,
            },
            isSuperAdmin: false,
            OR: [
                { isOwner: true },
                { role: Role.ADMIN },
            ],
        },
        select: {
            id: true,
            role: true,
            isOwner: true,
        },
    });

    return users.map((user) => ({
        id: user.id,
        role: user.role,
        isOwner: user.isOwner,
    }));
}

export const companyService = {
    /**
     * Create a new company
     * Only SUPER_ADMIN can create companies directly
     */
    async create(input: CreateCompanyInput) {
        const { name, email, phone, slug, createdBySuperAdminId } = input;

        // Check if slug is unique if provided
        if (slug) {
            const existing = await companyRepository.findBySlug(slug);
            if (existing) {
                throw new AppError(400, "Company slug already exists");
            }
        }

        try {
            const company = await companyRepository.create({
                name,
                email,
                phone,
                slug,
                createdBySuperAdminId: createdBySuperAdminId || null,
                isActive: true,
                isSuspended: false,
            });

            return {
                id: company.id,
                name: company.name,
                email: company.email,
                phone: company.phone,
                slug: company.slug,
                isActive: company.isActive,
                isSuspended: company.isSuspended,
                createdAt: company.createdAt,
                updatedAt: company.updatedAt,
            };
        } catch (error: unknown) {
            if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
                throw new AppError(400, "Company with this identifier already exists");
            }
            throw error;
        }
    },

    /**
     * Get company by ID
     * Users can only access their own company (unless SUPER_ADMIN)
     */
    async getById(companyId: string, requestingUserId?: string, requestingUserRole?: Role) {
        const company = await companyRepository.findByIdWithCounts(companyId);

        if (!company) {
            throw new AppError(404, "Company not found");
        }

        // SUPER_ADMIN can access any company
        if (requestingUserRole === Role.SUPER_ADMIN) {
            // For super admin, also include users and properties details
            const [companyWithUsers, companyWithProperties] = await Promise.all([
                companyRepository.findByIdWithUsers(companyId),
                companyRepository.findByIdWithProperties(companyId),
            ]);

            // Check if company has any active users with verified emails
            const activeUsersCount = await userRepository.count({
                companyId,
                deletedAt: null,
                isActive: true,
                emailVerified: true,
            });
            const hasActiveUsers = activeUsersCount > 0;
            
            // Check if company has an active admin/owner user with verified email (not deleted)
            const activeAdminCount = await userRepository.count({
                AND: [
                    { companyId },
                    { deletedAt: null },
                    { isActive: true },
                    { emailVerified: true },
                    {
                        OR: [
                            { isOwner: true },
                            { role: Role.ADMIN },
                        ],
                    },
                ],
            });
            const hasActiveAdmin = activeAdminCount > 0;
            
            // Company is effectively inactive if it has no active users with verified emails, 
            // or if the admin/owner account is deleted/inactive, even if isActive is true
            const effectiveIsActive = company.isActive && hasActiveUsers && hasActiveAdmin;

            const companyRow = companyWithUsers;
            const usersForAdmin = (companyWithUsers?.users || []).map((u) => ({
                id: u.id,
                name: u.name,
                email: u.email,
                role: u.role,
                createdAt: u.createdAt,
                deletedAt: u.deletedAt,
                isActive: isUserOperationallyActive(
                    { isActive: u.isActive, emailVerified: u.emailVerified },
                    companyRow
                        ? {
                            isActive: companyRow.isActive,
                            isSuspended: companyRow.isSuspended,
                            deletedAt: companyRow.deletedAt,
                        }
                        : null
                ),
            }));

            return {
                id: company.id,
                name: company.name,
                email: company.email,
                phone: company.phone,
                slug: company.slug,
                isActive: effectiveIsActive, // Return computed status
                isSuspended: company.isSuspended,
                suspensionReason: company.suspensionReason,
                createdAt: company.createdAt,
                updatedAt: company.updatedAt,
                deletedAt: company.deletedAt,
                isPro: company.isPro,
                allowedOpenAiChatModels: sanitizeOpenAiModelIdList(company.allowedOpenAiChatModels),
                users: usersForAdmin,
                properties: companyWithProperties?.properties || [],
                propertiesCount: company._count.properties,
                usersCount: company._count.users,
                leadsCount: company._count.leads,
            };
        }

        // Regular users can only access their own company
        if (requestingUserId) {
            const user = await userRepository.findById(requestingUserId);

            if (!user) {
                throw new AppError(404, "User not found");
            }

            if (user.companyId !== companyId) {
                throw new AppError(403, "Forbidden: Access denied");
            }
        }

        return {
            id: company.id,
            name: company.name,
            email: company.email,
            phone: company.phone,
            slug: company.slug,
            isActive: company.isActive,
            isSuspended: company.isSuspended,
            suspensionReason: company.suspensionReason,
            createdAt: company.createdAt,
            updatedAt: company.updatedAt,
            deletedAt: company.deletedAt,
            isPro: company.isPro,
            _count: company._count,
        };
    },

    /**
     * Get company for the authenticated user
     */
    async getMyCompany(userId: string) {
        const user = await userRepository.findById(userId);

        if (!user) {
            throw new AppError(404, "User not found");
        }

        // SUPER_ADMIN doesn't have a company
        const isSuperAdmin = user.role === Role.SUPER_ADMIN || user.isSuperAdmin;
        if (isSuperAdmin) {
            throw new AppError(404, "Super Admin users do not have an associated company");
        }

        if (!user.companyId) {
            throw new AppError(404, "User is not associated with a company");
        }

        const company = await companyRepository.findById(user.companyId);

        if (!company) {
            throw new AppError(404, "Company not found");
        }

        // Logo field doesn't exist in database yet - set to null
        // TODO: Re-enable logo URL generation when logo column is added via migration
        const logo: string | null = null;

        return {
            id: company.id,
            name: company.name,
            email: company.email,
            phone: company.phone,
            slug: company.slug,
            logo,
            isActive: company.isActive,
            isSuspended: company.isSuspended,
            suspensionReason: company.suspensionReason,
            createdAt: company.createdAt,
            updatedAt: company.updatedAt,
        };
    },

    /**
     * Update company
     * Any authenticated user in the company or SUPER_ADMIN can update
     * Allows partial updates - users can save incomplete information and edit later
     */
    async update(
        companyId: string,
        input: UpdateCompanyInput,
        requestingUserId: string,
        requestingUserRole: Role
    ) {
        // Validate that at least one field is provided
        if (!input.name && input.email === undefined && input.phone === undefined) {
            throw new AppError(400, "At least one field (name, email, or phone) must be provided");
        }

        // Check if company exists
        const company = await companyRepository.findById(companyId);

        if (!company) {
            throw new AppError(404, "Company not found");
        }

        // SUPER_ADMIN can update any company
        if (requestingUserRole !== Role.SUPER_ADMIN) {
            // Regular users can only update their own company
            const user = await userRepository.findById(requestingUserId);

            if (!user) {
                throw new AppError(404, "User not found");
            }

            if (!user.companyId || user.companyId !== companyId) {
                throw new AppError(403, "Forbidden: Access denied");
            }

            // Allow all authenticated users in the company to update company information
            // This enables users to add and save company information as needed
        }

        // Build update data - only include fields that are provided
        const updateData: UpdateCompanyInput = {};
        if (input.name !== undefined) {
            updateData.name = input.name;
        }
        if (input.email !== undefined) {
            updateData.email = input.email;
        }
        if (input.phone !== undefined) {
            updateData.phone = input.phone;
        }

        const updated = await companyRepository.update(companyId, updateData);

        return {
            id: updated.id,
            name: updated.name,
            email: updated.email,
            phone: updated.phone,
            slug: updated.slug,
            isActive: updated.isActive,
            isSuspended: updated.isSuspended,
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt,
        };
    },

    /**
     * Validate if PRO can be enabled for a company
     * Checks: company not suspended, has active users, has active admin with verified email
     */
    async validateProEnablement(companyId: string): Promise<void> {
        const company = await companyRepository.findById(companyId);

        if (!company) {
            throw new AppError(404, "Company not found");
        }

        // Prevent enabling PRO if company is suspended
        if (company.isSuspended) {
            throw new AppError(400, "Cannot enable PRO for a suspended company");
        }

        // Check if company has any active users
        const activeUsersCount = await userRepository.count({
            companyId,
            deletedAt: null,
            isActive: true,
        });

        if (activeUsersCount === 0) {
            throw new AppError(400, "Cannot enable PRO for a company with no active users");
        }

        // Check if company has any active users with verified emails
        const activeUsersWithVerifiedEmailCount = await userRepository.count({
            companyId,
            deletedAt: null,
            isActive: true,
            emailVerified: true,
        });

        // Check if company has an active admin/owner user with verified email (not deleted)
        const activeAdminCount = await userRepository.count({
            AND: [
                { companyId },
                { deletedAt: null },
                { isActive: true },
                { emailVerified: true },
                {
                    OR: [
                        { isOwner: true },
                        { role: Role.ADMIN },
                    ],
                },
            ],
        });

        // Check if company is inactive (either isActive = false OR no active users with verified emails OR no active admin)
        const isCompanyInactive = !company.isActive || activeUsersWithVerifiedEmailCount === 0 || activeAdminCount === 0;

        // If company is inactive, admin is deleted, or company is suspended, don't allow enabling PRO
        if (isCompanyInactive) {
            if (activeAdminCount === 0) {
                throw new AppError(400, "Cannot enable PRO for a company with deleted or inactive admin account");
            }
            throw new AppError(400, "Cannot enable PRO for an inactive company with unverified user emails");
        }
    },

    /**
     * Toggle Pro status for a company
     * Only SUPER_ADMIN can toggle Pro status
     */
    async toggleProStatus(companyId: string, isPro: boolean, processedById?: string) {
        const company = await companyRepository.findById(companyId);

        if (!company) {
            throw new AppError(404, "Company not found");
        }

        // Validate PRO enablement before enabling
        if (isPro) {
            await this.validateProEnablement(companyId);
        }

        const updated = await companyRepository.update(companyId, {
            isPro,
            ...(!isPro ? { allowedOpenAiChatModels: [] } : {}),
        });

        if (!isPro) {
            await prisma.property.updateMany({
                where: { companyId, deletedAt: null },
                data: { openAiChatModelId: null },
            });
        }

        if (processedById) {
            const latestUpgradeRequest = await upgradeRequestRepository.findLatestByCompanyId(companyId);
            if (latestUpgradeRequest) {
                await upgradeRequestRepository.update(latestUpgradeRequest.id, {
                    status: isPro ? "APPROVED" : "CONTACTED",
                    processedById,
                    processedAt: new Date(),
                });
            }
        }

        await subscriptionService.syncSubscriptionForCompany(companyId, updated.isPro);

        return {
            id: updated.id,
            name: updated.name,
            email: updated.email,
            phone: updated.phone,
            slug: updated.slug,
            isActive: updated.isActive,
            isSuspended: updated.isSuspended,
            isPro: updated.isPro,
            suspensionReason: updated.suspensionReason,
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt,
        };
    },

    /**
     * Super Admin: define which OpenAI chat completion models a Pro company may use.
     */
    async updateAllowedOpenAiChatModels(companyId: string, modelIds: string[]) {
        const company = await companyRepository.findById(companyId);
        if (!company) {
            throw new AppError(404, "Company not found");
        }
        if (!company.isPro) {
            throw new AppError(400, "Only Pro companies can have OpenAI chat models assigned.");
        }
        const sanitized = sanitizeOpenAiModelIdList(modelIds);
        const updated = await companyRepository.update(companyId, {
            allowedOpenAiChatModels: sanitized,
        });
        if (sanitized.length === 0) {
            await prisma.property.updateMany({
                where: { companyId, deletedAt: null, openAiChatModelId: { not: null } },
                data: { openAiChatModelId: null },
            });
        } else {
            await prisma.property.updateMany({
                where: {
                    companyId,
                    deletedAt: null,
                    openAiChatModelId: { not: null, notIn: sanitized },
                },
                data: { openAiChatModelId: null },
            });
        }
        return {
            id: updated.id,
            name: updated.name,
            isPro: updated.isPro,
            allowedOpenAiChatModels: updated.allowedOpenAiChatModels ?? [],
        };
    },

    /**
     * Suspend a company
     * Only SUPER_ADMIN can suspend companies
     */
    async suspend(companyId: string, input: SuspendCompanyInput) {
        const company = await companyRepository.findById(companyId);

        if (!company) {
            throw new AppError(404, "Company not found");
        }

        if (company.isSuspended) {
            throw new AppError(400, "Company is already suspended");
        }

        const updated = await companyRepository.update(companyId, {
            isSuspended: true,
            suspensionReason: input.suspensionReason || null,
        });

        return {
            id: updated.id,
            name: updated.name,
            isSuspended: updated.isSuspended,
            suspensionReason: updated.suspensionReason,
            updatedAt: updated.updatedAt,
        };
    },

    /**
     * Activate (unsuspend) a company
     * Only SUPER_ADMIN can activate companies
     */
    async activate(companyId: string, recoveredByUserId?: string) {
        const company = await companyRepository.findById(companyId);

        if (!company) {
            throw new AppError(404, "Company not found");
        }

        if (!company.isSuspended && !company.deletedAt && company.isActive) {
            throw new AppError(400, "Company is already active");
        }

        const updated = await prisma.$transaction(async (tx) => {
            let archivedUsers = company.deletedAt
                ? getArchivedUsersFromAuditMetadata(
                    (
                        await tx.auditLog.findFirst({
                            where: {
                                companyId,
                                action: "DELETE",
                                resourceType: "COMPANY",
                                resourceId: companyId,
                            },
                            orderBy: { createdAt: "desc" },
                            select: { metadata: true },
                        })
                    )?.metadata ?? null
                )
                : [];

            if (company.deletedAt && archivedUsers.length === 0) {
                archivedUsers = await getLegacyArchiveUserSnapshots(tx, companyId, company.deletedAt);
            }

            if (company.deletedAt && archivedUsers.length === 0) {
                throw new AppError(409, "Archived company recovery metadata is unavailable");
            }

            const companyUpdate = await tx.company.update({
                where: { id: companyId },
                data: {
                    isActive: true,
                    isSuspended: false,
                    suspensionReason: null,
                    deletedAt: null,
                    isPro: false,
                    hasUsedFreeExport: false,
                },
            });

            if (company.deletedAt) {
                for (const archivedUser of archivedUsers) {
                    if (archivedUser.role === Role.SUPER_ADMIN) {
                        continue;
                    }

                    const user = await tx.user.findFirst({
                        where: {
                            id: archivedUser.id,
                            companyId,
                            deletedAt: { not: null },
                            isSuperAdmin: false,
                        },
                    });

                    if (user) {
                        await tx.user.update({
                            where: { id: user.id },
                            data: {
                                deletedAt: null,
                                isActive: true,
                                isOwner: archivedUser.isOwner,
                                role: archivedUser.role,
                            },
                        });
                    }
                }

                await tx.auditLog.create({
                    data: {
                        companyId,
                        userId: recoveredByUserId,
                        action: "ACTIVATE",
                        resourceType: "COMPANY",
                        resourceId: companyId,
                        metadata: {
                            action: "COMPANY_RECOVERY",
                            recoveredArchivedUserIds: archivedUsers.map((user) => user.id),
                        },
                    },
                });
            }

            return companyUpdate;
        });

        return {
            id: updated.id,
            name: updated.name,
            isActive: updated.isActive,
            isSuspended: updated.isSuspended,
            suspensionReason: updated.suspensionReason,
            deletedAt: updated.deletedAt,
            updatedAt: updated.updatedAt,
        };
    },

    /**
     * List all companies (SUPER_ADMIN only)
     */
    async listAll(
        page: number = 1,
        limit: number = 50,
        search?: string,
        statusFilter?: "all" | "active" | "suspended" | "inactive" | "archived",
        planFilter?: "all" | "pro" | "free"
    ) {
        const result = await companyRepository.listAll(page, limit, search, statusFilter, planFilter);

        return {
            companies: result.companies,
            pagination: {
                page,
                limit,
                total: result.total,
                totalPages: Math.ceil(result.total / limit),
            },
        };
    },
};

