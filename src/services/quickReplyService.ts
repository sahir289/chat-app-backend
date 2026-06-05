import { quickReplyRepository } from "../repositories/quickReplyRepository";
import { propertyRepository } from "../repositories/propertyRepository";
import { AppError } from "../utils/appError";
import type { QuickReply } from "@prisma/client";
import { checkAgentPropertyAccess } from "../utils/agentPropertyFilter";
import prisma from "../lib/prisma";
import { CreateQuickReplyParams, QuickReplyDTO, UpdateQuickReplyParams } from "../types/quickReply";
import { Role } from "@prisma/client";

export const quickReplyService = {
    async createQuickReply(params: CreateQuickReplyParams): Promise<QuickReplyDTO> {
        // Validate order uniqueness if provided
        if (params.order !== undefined) {
            const orderExists = await quickReplyRepository.checkOrderExists(
                params.propertyId,
                params.companyId,
                params.order
            );
            if (orderExists) {
                throw new AppError(400, `Order ${params.order} already exists for this property. Please use a different order value.`);
            }
        }

        // Check access (cheap check before DB)
        await this.ensureUserHasAccess(params.userId, params.propertyId, params.companyId, params.userRole);

        // Business logic - if order not provided, repository will auto-assign
        const quickReply = await quickReplyRepository.create({
            companyId: params.companyId,
            propertyId: params.propertyId,
            label: params.label.trim(),
            message: params.message.trim(),
            order: params.order, // Pass undefined if not provided, repository will auto-assign
            isActive: params.isActive ?? true,
        });

        return this.toDTO(quickReply);
    },

    async updateQuickReply(params: UpdateQuickReplyParams): Promise<QuickReplyDTO> {
        // Check QuickReply exists and user has access
        const existingQuickReply = await quickReplyRepository.findById(params.quickReplyId, params.companyId);
        if (!existingQuickReply) {
            throw new AppError(404, "Quick reply not found");
        }

        await this.ensureUserHasAccess(params.userId, existingQuickReply.propertyId, params.companyId, params.userRole);

        // Validate order uniqueness if provided and different from current order
        if (params.order !== undefined && params.order !== existingQuickReply.order) {
            const orderExists = await quickReplyRepository.checkOrderExists(
                existingQuickReply.propertyId,
                params.companyId,
                params.order,
                params.quickReplyId // Exclude current quick reply from check
            );
            if (orderExists) {
                throw new AppError(400, `Order ${params.order} already exists for this property. Please use a different order value.`);
            }
        }

        // Business logic
        const updatedQuickReply = await quickReplyRepository.update(params.quickReplyId, params.companyId, {
            ...(params.label !== undefined && { label: params.label.trim() }),
            ...(params.message !== undefined && { message: params.message.trim() }),
            ...(params.order !== undefined && { order: params.order }),
            ...(params.isActive !== undefined && { isActive: params.isActive }),
        });

        return this.toDTO(updatedQuickReply);
    },

    async deleteQuickReply(userId: string, companyId: string, quickReplyId: string, userRole?: Role): Promise<void> {
        // Check QuickReply exists and user has access
        const existingQuickReply = await quickReplyRepository.findById(quickReplyId, companyId);
        if (!existingQuickReply) {
            throw new AppError(404, "Quick reply not found");
        }

        await this.ensureUserHasAccess(userId, existingQuickReply.propertyId, companyId, userRole);

        // Business logic
        await quickReplyRepository.delete(quickReplyId, companyId);
    },

    async getQuickRepliesByProperty(
        userId: string,
        companyId: string,
        propertyId: string,
        includeInactive = false,
        userRole?: Role
    ): Promise<QuickReplyDTO[]> {
        // Check access (cheap check before DB)
        await this.ensureUserHasAccess(userId, propertyId, companyId, userRole);

        // Business logic
        const quickReplies = await quickReplyRepository.findByPropertyId(propertyId, companyId, includeInactive);

        return quickReplies.map(this.toDTO);
    },

    // Access control
    async ensureUserHasAccess(userId: string, propertyId: string, companyId: string, userRole?: Role): Promise<void> {
        const property = await propertyRepository.findById(propertyId, companyId);
        if (!property) {
            throw new AppError(404, "Property not found");
        }
        
        // Check agent-specific access if user is an agent
        if (userRole === Role.AGENT && userId) {
            const hasAccess = await checkAgentPropertyAccess(userId, propertyId);
            if (!hasAccess) {
                throw new AppError(403, "Access denied. You don't have permission to access this property.");
            }
        }
    },

    // Public method (no auth required) - for widget use
    async getPublicQuickRepliesByProperty(propertyId: string): Promise<QuickReplyDTO[]> {
        // First verify property exists to get companyId for security
        // This ensures we only return quick replies for valid properties
        const property = await prisma.property.findFirst({
            where: {
                id: propertyId,
                deletedAt: null,
            },
            select: { id: true, companyId: true },
        });
        
        if (!property) {
            throw new AppError(404, "Property not found");
        }
        
        // Get only active quick replies for this property's company, ordered by order ASC
        const quickReplies = await quickReplyRepository.findActiveByPropertyId(propertyId, property.companyId);
        return quickReplies.map(this.toDTO);
    },

    // DTO conversion
    toDTO(quickReply: QuickReply): QuickReplyDTO {
        return {
            id: quickReply.id,
            companyId: quickReply.companyId,
            propertyId: quickReply.propertyId,
            label: quickReply.label,
            message: quickReply.message,
            order: quickReply.order,
            isActive: quickReply.isActive,
            createdAt: quickReply.createdAt,
            updatedAt: quickReply.updatedAt,
        };
    },
};

