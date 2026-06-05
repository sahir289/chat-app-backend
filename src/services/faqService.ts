import { faqRepository } from "../repositories/faqRepository";
import { propertyRepository } from "../repositories/propertyRepository";
import { checkAgentPropertyAccess } from "../utils/agentPropertyFilter";
import { CreateFAQParams, FAQDTO, UpdateFAQParams } from "../types/faqService";
import { AppError } from "../utils/appError";
import type { FAQ } from "@prisma/client";

export const faqService = {
    async createFAQ(params: CreateFAQParams): Promise<FAQDTO> {
        // Check access (cheap check before DB)
        await this.ensureUserHasAccess(params.userId, params.propertyId, params.companyId);

        // Check for duplicate order if order is provided
        if (params.order !== undefined) {
            const existingFAQ = await faqRepository.findByOrderAndProperty(
                params.propertyId,
                params.companyId,
                params.order
            );
            if (existingFAQ) {
                throw new AppError(
                    400,
                    "Order already exists. Delete/update the old FAQ or choose another order."
                );
            }
        }

        // Business logic (validation is handled by route middleware)
        const faq = await faqRepository.create({
            companyId: params.companyId,
            propertyId: params.propertyId,
            question: params.question.trim(),
            answer: params.answer.trim(),
            order: params.order, // Pass undefined if not provided, repository will auto-assign
            isActive: params.isActive ?? true,
        });

        return this.toDTO(faq);
    },

    async updateFAQ(params: UpdateFAQParams): Promise<FAQDTO> {
        // Check FAQ exists and user has access
        const existingFAQ = await faqRepository.findById(params.faqId, params.companyId);
        if (!existingFAQ) {
            throw new AppError(404, "FAQ not found");
        }

        await this.ensureUserHasAccess(params.userId, existingFAQ.propertyId, params.companyId);

        // Check for duplicate order if order is being updated
        if (params.order !== undefined && params.order !== existingFAQ.order) {
            const duplicateFAQ = await faqRepository.findByOrderAndProperty(
                existingFAQ.propertyId,
                params.companyId,
                params.order,
                params.faqId // Exclude current FAQ from duplicate check
            );
            if (duplicateFAQ) {
                throw new AppError(
                    400,
                    "Order already exists. Delete/update the old FAQ or choose another order."
                );
            }
        }

        // Business logic (validation is handled by route middleware)
        const updatedFAQ = await faqRepository.update(params.faqId, params.companyId, {
            ...(params.question !== undefined && { question: params.question.trim() }),
            ...(params.answer !== undefined && { answer: params.answer.trim() }),
            ...(params.order !== undefined && { order: params.order }),
            ...(params.isActive !== undefined && { isActive: params.isActive }),
        });

        return this.toDTO(updatedFAQ);
    },

    async deleteFAQ(userId: string, companyId: string, faqId: string): Promise<void> {
        // Check FAQ exists and user has access
        const existingFAQ = await faqRepository.findById(faqId, companyId);
        if (!existingFAQ) {
            throw new AppError(404, "FAQ not found");
        }

        await this.ensureUserHasAccess(userId, existingFAQ.propertyId, companyId);

        // Business logic
        await faqRepository.delete(faqId, companyId);
    },

    async getFAQsByProperty(
        userId: string,
        companyId: string,
        propertyId: string,
        includeInactive = false
    ): Promise<FAQDTO[]> {
        // Check access (cheap check before DB)
        await this.ensureUserHasAccess(userId, propertyId, companyId);

        // Business logic
        const faqs = await faqRepository.findByPropertyId(propertyId, companyId, includeInactive);

        return faqs.map(this.toDTO);
    },

    async searchFAQs(propertyId: string, query: string, limit = 10): Promise<FAQDTO[]> {
        // Early validation
        if (!query || !query.trim()) {
            return [];
        }

        // Business logic
        const faqs = await faqRepository.searchByProperty(propertyId, query, limit);

        return faqs.map(this.toDTO);
    },


    // Access control
    async ensureUserHasAccess(userId: string, propertyId: string, companyId: string): Promise<void> {
        const property = await propertyRepository.findById(propertyId, companyId);
        if (!property) {
            throw new AppError(404, "Property not found");
        }
        const allowed = await checkAgentPropertyAccess(userId, propertyId);
        if (!allowed) {
            throw new AppError(403, "Access denied to this property");
        }
    },

    // DTO conversion
    toDTO(faq: FAQ): FAQDTO {
        return {
            id: faq.id,
            companyId: faq.companyId,
            propertyId: faq.propertyId,
            question: faq.question,
            answer: faq.answer,
            order: faq.order,
            isActive: faq.isActive,
            createdAt: faq.createdAt,
            updatedAt: faq.updatedAt,
        };
    },
};

