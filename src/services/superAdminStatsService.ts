import { companyRepository } from "../repositories/companyRepository";
import { userRepository } from "../repositories/userRepository";
import { leadRepository } from "../repositories/leadRepository";
import { Role } from "@prisma/client";
import { PlatformStats, PlatformStatsFilters } from "../types/platformStats";

export const superAdminStatsService = {
    async getPlatformStats(filters?: PlatformStatsFilters): Promise<PlatformStats> {
        const createdAtFilter =
            filters?.startDate || filters?.endDate
                ? {
                    createdAt: {
                        ...(filters?.startDate ? { gte: filters.startDate } : {}),
                        ...(filters?.endDate ? { lt: filters.endDate } : {}),
                    },
                }
                : {};

        // Get total companies (including deleted)
        const totalCompanies = await companyRepository.count({
            ...createdAtFilter,
        });

        // Get total users (including super admins and deleted)
        const totalUsers = await userRepository.count({
            isSuperAdmin: false,
            ...createdAtFilter,
        });

        // Get active users (isActive = true, emailVerified = true, excluding super admins and deleted)
        const activeUsers = await userRepository.count({
            deletedAt: null,
            isSuperAdmin: false,
            isActive: true,
            emailVerified: true,
            ...createdAtFilter,
        });

        // Get pro users (ADMIN users only in companies where isPro = true, excluding AGENT users)
        const proUsers = await userRepository.count({
            deletedAt: null,
            isSuperAdmin: false,
            role: Role.ADMIN,
            ...createdAtFilter,
            company: {
                isPro: true,
                deletedAt: null,
            },
        });

        // Get free/trial users (ADMIN users only in companies where isPro = false, excluding AGENT users)
        const freeTrialUsers = await userRepository.count({
            deletedAt: null,
            isSuperAdmin: false,
            role: Role.ADMIN,
            ...createdAtFilter,
            company: {
                isPro: false,
                deletedAt: null,
            },
        });

        // Get total leads across all companies
        const totalLeads = await leadRepository.count({
            ...createdAtFilter,
        });

        return {
            totalCompanies,
            totalUsers,
            activeUsers,
            proUsers,
            freeTrialUsers,
            totalLeads,
        };
    },
};

