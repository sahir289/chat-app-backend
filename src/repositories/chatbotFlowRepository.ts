import prisma from "../lib/prisma";
import type { ChatbotFlow } from "@prisma/client";

export interface CreateChatbotFlowData {
    companyId: string;
    propertyId: string;
    name: string;
    description?: string;
    flow: Record<string, any>; // JSON flow definition
    isActive?: boolean;
}

export interface UpdateChatbotFlowData {
    name?: string;
    description?: string;
    flow?: Record<string, any>;
    isActive?: boolean;
}

export const chatbotFlowRepository = {
    async create(data: CreateChatbotFlowData): Promise<ChatbotFlow> {
        return prisma.chatbotFlow.create({
            data: {
                companyId: data.companyId,
                propertyId: data.propertyId,
                name: data.name,
                description: data.description ?? null,
                flow: data.flow,
                isActive: data.isActive ?? true,
            },
        });
    },

    async findById(id: string, companyId?: string): Promise<ChatbotFlow | null> {
        return prisma.chatbotFlow.findFirst({
            where: {
                id,
                ...(companyId ? { companyId } : {}),
            },
        });
    },

    async findByPropertyId(propertyId: string, companyId: string, includeInactive = false): Promise<ChatbotFlow[]> {
        return prisma.chatbotFlow.findMany({
            where: {
                propertyId,
                companyId,
                ...(includeInactive ? {} : { isActive: true }),
            },
            orderBy: { createdAt: "desc" },
        });
    },

    async findActiveByProperty(propertyId: string): Promise<ChatbotFlow | null> {
        return prisma.chatbotFlow.findFirst({
            where: {
                propertyId,
                isActive: true,
            },
            orderBy: { createdAt: "desc" },
        });
    },

    async update(id: string, companyId: string, data: UpdateChatbotFlowData): Promise<ChatbotFlow> {
        return prisma.chatbotFlow.update({
            where: {
                id,
                companyId,
            },
            data: {
                ...(data.name !== undefined && { name: data.name }),
                ...(data.description !== undefined && { description: data.description ?? null }),
                ...(data.flow !== undefined && { flow: data.flow }),
                ...(data.isActive !== undefined && { isActive: data.isActive }),
            },
        });
    },

    async delete(id: string, companyId: string): Promise<void> {
        await prisma.chatbotFlow.delete({
            where: {
                id,
                companyId,
            },
        });
    },
};

