import prisma from "../lib/prisma";
import type { QuickReply } from "@prisma/client";
import { CreateQuickReplyData, UpdateQuickReplyData } from "../types/quickReply";

export const quickReplyRepository = {
    async create(data: CreateQuickReplyData): Promise<QuickReply> {
        // If order is not provided, calculate the next available order for this property
        let order = data.order;
        if (order === undefined) {
            const maxOrder = await this.getMaxOrderForProperty(data.propertyId, data.companyId);
            order = maxOrder + 1;
        }

        return prisma.quickReply.create({
            data: {
                companyId: data.companyId,
                propertyId: data.propertyId,
                label: data.label,
                message: data.message,
                order,
                isActive: data.isActive ?? true,
            },
        });
    },

    async getMaxOrderForProperty(propertyId: string, companyId: string): Promise<number> {
        const result = await prisma.quickReply.findFirst({
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

    async checkOrderExists(propertyId: string, companyId: string, order: number, excludeId?: string): Promise<boolean> {
        const existing = await prisma.quickReply.findFirst({
            where: {
                propertyId,
                companyId,
                order,
                ...(excludeId ? { id: { not: excludeId } } : {}),
            },
        });
        return !!existing;
    },

    async findById(id: string, companyId?: string): Promise<QuickReply | null> {
        return prisma.quickReply.findFirst({
            where: {
                id,
                ...(companyId ? { companyId } : {}),
            },
        });
    },

    async findByPropertyId(propertyId: string, companyId: string, includeInactive = false): Promise<QuickReply[]> {
        return prisma.quickReply.findMany({
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

    async findActiveByPropertyId(propertyId: string, companyId: string): Promise<QuickReply[]> {
        return prisma.quickReply.findMany({
            where: {
                propertyId,
                companyId,
                isActive: true,
            },
            orderBy: [
                { order: "asc" },
                { createdAt: "asc" },
            ],
        });
    },

    async update(id: string, companyId: string, data: UpdateQuickReplyData): Promise<QuickReply> {
        return prisma.quickReply.update({
            where: {
                id,
                companyId,
            },
            data: {
                ...(data.label !== undefined && { label: data.label }),
                ...(data.message !== undefined && { message: data.message }),
                ...(data.order !== undefined && { order: data.order }),
                ...(data.isActive !== undefined && { isActive: data.isActive }),
            },
        });
    },

    async delete(id: string, companyId: string): Promise<void> {
        await prisma.quickReply.delete({
            where: {
                id,
                companyId,
            },
        });
    },
};

