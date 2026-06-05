import type { AiCreditsAddonRequest, Prisma } from "@prisma/client";
import prisma from "../lib/prisma";

const companySelect = {
    id: true,
    name: true,
    email: true,
} as const;

const processedBySelect = {
    id: true,
    name: true,
    email: true,
} as const;

export type AiCreditsAddonRequestWithRelations = AiCreditsAddonRequest & {
    company: { id: string; name: string; email: string | null };
    processedBy: { id: string; name: string | null; email: string } | null;
};

const includeRelations = {
    company: { select: companySelect },
    processedBy: { select: processedBySelect },
} satisfies Prisma.AiCreditsAddonRequestInclude;

export const aiCreditsAddonRequestRepository = {
    async create(data: {
        companyId: string;
        message?: string | null;
        requestedCredits?: number | null;
    }): Promise<AiCreditsAddonRequest> {
        return prisma.aiCreditsAddonRequest.create({
            data: {
                companyId: data.companyId,
                message: data.message?.trim() || null,
                requestedCredits: data.requestedCredits ?? null,
            },
        });
    },

    async findPendingByCompanyId(companyId: string): Promise<AiCreditsAddonRequest | null> {
        return prisma.aiCreditsAddonRequest.findFirst({
            where: {
                companyId,
                status: "PENDING",
            },
            orderBy: { createdAt: "desc" },
        });
    },

    async findById(id: string): Promise<AiCreditsAddonRequestWithRelations | null> {
        return prisma.aiCreditsAddonRequest.findUnique({
            where: { id },
            include: includeRelations,
        });
    },

    async listByCompanyId(companyId: string): Promise<AiCreditsAddonRequest[]> {
        return prisma.aiCreditsAddonRequest.findMany({
            where: { companyId },
            orderBy: { createdAt: "desc" },
        });
    },

    async listAll(status?: string): Promise<AiCreditsAddonRequestWithRelations[]> {
        return prisma.aiCreditsAddonRequest.findMany({
            where: status ? { status: status as "PENDING" | "FULFILLED" | "REJECTED" } : undefined,
            orderBy: { createdAt: "desc" },
            include: includeRelations,
        });
    },

    async updateStatus(
        id: string,
        data: {
            status: "FULFILLED" | "REJECTED";
            notes?: string | null;
            processedById: string;
        }
    ): Promise<AiCreditsAddonRequest> {
        return prisma.aiCreditsAddonRequest.update({
            where: { id },
            data: {
                status: data.status,
                notes: data.notes?.trim() || null,
                processedById: data.processedById,
                processedAt: new Date(),
            },
        });
    },
};
