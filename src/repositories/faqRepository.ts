import prisma from "../lib/prisma";
import type { FAQ } from "@prisma/client";

export interface CreateFAQData {
    companyId: string;
    propertyId: string;
    question: string;
    answer: string;
    order?: number;
    isActive?: boolean;
}

export interface UpdateFAQData {
    question?: string;
    answer?: string;
    order?: number;
    isActive?: boolean;
}

export const faqRepository = {
    async create(data: CreateFAQData): Promise<FAQ> {
        // If order is not provided, calculate the next available order for this property
        let order = data.order;
        if (order === undefined) {
            const maxOrder = await this.getMaxOrderForProperty(data.propertyId, data.companyId);
            order = maxOrder + 1;
        }

        return prisma.fAQ.create({
            data: {
                companyId: data.companyId,
                propertyId: data.propertyId,
                question: data.question,
                answer: data.answer,
                order,
                isActive: data.isActive ?? true,
            },
        });
    },

    async getMaxOrderForProperty(propertyId: string, companyId: string): Promise<number> {
        const result = await prisma.fAQ.findFirst({
            where: {
                propertyId,
                companyId,
            },
            orderBy: {
                order: "desc",
            },
            select: {
                order: true,
            },
        });

        return result?.order ?? -1; // Return -1 if no items exist, so first item gets order 0
    },

    async findById(id: string, companyId?: string): Promise<FAQ | null> {
        return prisma.fAQ.findFirst({
            where: {
                id,
                ...(companyId ? { companyId } : {}),
            },
        });
    },

    async findByPropertyId(propertyId: string, companyId: string, includeInactive = false): Promise<FAQ[]> {
        return prisma.fAQ.findMany({
            where: {
                propertyId,
                companyId,
                ...(includeInactive ? {} : { isActive: true }),
            },
            orderBy: [
                { order: "asc" },
                { createdAt: "asc" },
            ],
        });
    },

    async update(id: string, companyId: string, data: UpdateFAQData): Promise<FAQ> {
        return prisma.fAQ.update({
            where: {
                id,
                companyId,
            },
            data: {
                ...(data.question !== undefined && { question: data.question }),
                ...(data.answer !== undefined && { answer: data.answer }),
                ...(data.order !== undefined && { order: data.order }),
                ...(data.isActive !== undefined && { isActive: data.isActive }),
            },
        });
    },

    async delete(id: string, companyId: string): Promise<void> {
        await prisma.fAQ.delete({
            where: {
                id,
                companyId,
            },
        });
    },

    async searchByProperty(propertyId: string, query: string, limit = 10): Promise<FAQ[]> {
        const searchTerm = query.trim();

        if (!searchTerm) {
            return [];
        }

        return prisma.fAQ.findMany({
            where: {
                propertyId,
                isActive: true,
                // Exact match only - user message must exactly match the FAQ question (case-insensitive, trimmed)
                question: {
                    equals: searchTerm,
                    mode: "insensitive",
                },
            },
            orderBy: [
                { order: "asc" },
                { createdAt: "asc" },
            ],
            take: limit,
        });
    },

    async findByOrderAndProperty(
        propertyId: string,
        companyId: string,
        order: number,
        excludeId?: string
    ): Promise<FAQ | null> {
        return prisma.fAQ.findFirst({
            where: {
                propertyId,
                companyId,
                order,
                ...(excludeId ? { id: { not: excludeId } } : {}),
            },
        });
    },
};

