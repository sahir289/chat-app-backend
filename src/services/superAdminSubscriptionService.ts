import { companyRepository } from "../repositories/companyRepository";
import { subscriptionRepository } from "../repositories/subscriptionRepository";
import { moduleControlService } from "./moduleControlService";
import { subscriptionManagementService } from "./subscriptionManagementService";
import { subscriptionService } from "./subscriptionService";
import { notifyCompanyUsersOfProUpgrade } from "./emailService";
import { AppError } from "../utils/appError";
import { companyService } from "./companyService";
import { aiCreditsService } from "./aiCreditsService";
import type { PlanTier, SubscriptionStatus } from "@prisma/client";
export const superAdminSubscriptionService = {
    async getAllSubscriptions() {
        const companies = await companyRepository.listAll(1, 1000); // Get all companies
        return companies.companies.map((company) => ({
            id: company.id,
            name: company.name,
            email: company.email,
            phone: company.phone,
            isPro: company.isPro,
            isActive: company.isActive,
            isSuspended: company.isSuspended,
            createdAt: company.createdAt,
            updatedAt: company.updatedAt,
            _count: {
                users: 0, // Will be populated if needed
                properties: 0, // Will be populated if needed
            },
        }));
    },

    async getSubscriptionDetails(companyId: string) {
        const company = await companyRepository.findById(companyId);
        if (!company) {
            throw new AppError(404, "Company not found");
        }

        // Get subscription if exists (for future use)
        await subscriptionRepository.findByCompanyId(companyId);

        // Get upgrade requests (last 10)
        // Note: This would need to be added to a repository if not already available
        // For now, we'll return basic company info
        return {
            id: company.id,
            name: company.name,
            email: company.email,
            phone: company.phone,
            isPro: company.isPro,
            isActive: company.isActive,
            isSuspended: company.isSuspended,
            createdAt: company.createdAt,
            updatedAt: company.updatedAt,
            upgradeRequests: [], // Would need upgradeRequestRepository
            _count: {
                users: 0, // Would need to be populated
                properties: 0, // Would need to be populated
                chats: 0, // Would need to be populated
            },
        };
    },

    async enableProAccess(companyId: string, userId: string, reason?: string) {
        // Get company info before updating
        const companyBefore = await companyRepository.findById(companyId);
        if (!companyBefore) {
            throw new AppError(404, "Company not found");
        }

        // Validate that PRO can be enabled (checks: not suspended, has active users, has active admin)
        await companyService.validateProEnablement(companyId);

        // Update company to PRO
        const company = await companyRepository.update(companyId, { isPro: true });

        await subscriptionService.syncSubscriptionForCompany(companyId, true);

        // Enable all modules for PRO companies
        try {
            await moduleControlService.enableAllModules(
                companyId,
                userId,
                reason || "PRO access enabled by Super Admin"
            );
        } catch (error) {
            // Log error but don't fail the request if module enabling fails
        }

        // Send PRO upgrade notification emails to all active users if PRO was just enabled
        if (!companyBefore.isPro) {
            // PRO was just enabled (wasn't PRO before)
            // Send emails asynchronously (don't block the response)
            notifyCompanyUsersOfProUpgrade(companyId, company.name).catch((err) => {
            });
        }

        return company;
    },

    async disableProAccess(companyId: string, userId: string, reason?: string) {
        const company = await companyRepository.update(companyId, { isPro: false });

        await subscriptionService.syncSubscriptionForCompany(companyId, false);

        // Set modules for FREE plan: Enable FREE modules, disable PRO modules
        try {
            await moduleControlService.setFreePlanModules(
                companyId,
                userId,
                reason || "PRO access disabled by Super Admin - set to FREE plan modules"
            );
        } catch (error) {
            // Log error but don't fail the request if module update fails
        }

        return company;
    },

    async changePlan(subscriptionId: string, planTier: PlanTier, userId: string, reason?: string) {
        // Find subscription
        const subscription = await subscriptionRepository.findById(subscriptionId);
        if (!subscription) {
            throw new AppError(404, "Subscription not found");
        }

        // Update subscription plan tier
        const updated = await subscriptionManagementService.changePlanTier(
            subscriptionId,
            planTier,
            userId,
            reason
        );

        const isPro = planTier === "PRO";
        await companyRepository.update(subscription.companyId, {
            isPro,
        });
        await subscriptionService.syncSubscriptionForCompany(subscription.companyId, isPro);
        await aiCreditsService.syncCompanyPlanCredits(subscription.companyId);

        // Update modules based on plan
        try {
            if (isPro) {
                await moduleControlService.enableAllModules(
                    subscription.companyId,
                    userId,
                    reason || "Plan changed to PRO by Super Admin"
                );
            } else {
                await moduleControlService.setFreePlanModules(
                    subscription.companyId,
                    userId,
                    reason || "Plan changed to FREE by Super Admin"
                );
            }
        } catch (error) {
        }

        return updated;
    },

    async getSubscriptionForCompany(companyId: string) {
        return subscriptionService.getSubscriptionByCompanyId(companyId);
    },

    async changeStatus(subscriptionId: string, status: SubscriptionStatus, userId: string, reason?: string) {
        // Find subscription
        const subscription = await subscriptionRepository.findById(subscriptionId);
        if (!subscription) {
            throw new AppError(404, "Subscription not found");
        }

        // Update subscription status
        const updated = await subscriptionManagementService.changeStatus(
            subscriptionId,
            status,
            userId,
            reason
        );

        return updated;
    },
};

