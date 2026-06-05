import { chatbotFlowRepository } from "../repositories/chatbotFlowRepository";
import { propertyRepository } from "../repositories/propertyRepository";
import { checkAgentPropertyAccess } from "../utils/agentPropertyFilter";
import { ChatbotFlowDTO, CreateChatbotFlowParams, FlowExecutionResult, UpdateChatbotFlowParams } from "../types/chatFlowService";
import { AppError } from "../utils/appError";
import type { ChatbotFlow } from "@prisma/client";

export const chatbotFlowService = {
    async createChatbotFlow(params: CreateChatbotFlowParams): Promise<ChatbotFlowDTO> {
        // Check access (cheap check before DB)
        await this.ensureUserHasAccess(params.userId, params.propertyId, params.companyId);

        // Business logic (validation handled by middleware)
        const chatbotFlow = await chatbotFlowRepository.create({
            companyId: params.companyId,
            propertyId: params.propertyId,
            name: params.name.trim(),
            description: params.description?.trim(),
            flow: params.flow,
            isActive: params.isActive ?? true,
        });

        return this.toDTO(chatbotFlow);
    },

    async updateChatbotFlow(params: UpdateChatbotFlowParams): Promise<ChatbotFlowDTO> {
        // Check ChatbotFlow exists and user has access
        const existingFlow = await chatbotFlowRepository.findById(params.flowId, params.companyId);
        if (!existingFlow) {
            throw new AppError(404, "Chatbot flow not found");
        }

        await this.ensureUserHasAccess(params.userId, existingFlow.propertyId, params.companyId);

        // Business logic (validation handled by middleware)
        const updatedFlow = await chatbotFlowRepository.update(params.flowId, params.companyId, {
            ...(params.name !== undefined && { name: params.name.trim() }),
            ...(params.description !== undefined && { description: params.description?.trim() }),
            ...(params.flow !== undefined && { flow: params.flow }),
            ...(params.isActive !== undefined && { isActive: params.isActive }),
        });

        return this.toDTO(updatedFlow);
    },

    async deleteChatbotFlow(userId: string, companyId: string, flowId: string): Promise<void> {
        // Check ChatbotFlow exists and user has access
        const existingFlow = await chatbotFlowRepository.findById(flowId, companyId);
        if (!existingFlow) {
            throw new AppError(404, "Chatbot flow not found");
        }

        await this.ensureUserHasAccess(userId, existingFlow.propertyId, companyId);

        // Business logic
        await chatbotFlowRepository.delete(flowId, companyId);
    },

    async getChatbotFlowsByProperty(
        userId: string,
        companyId: string,
        propertyId: string,
        includeInactive = false
    ): Promise<ChatbotFlowDTO[]> {
        // Check access (cheap check before DB)
        await this.ensureUserHasAccess(userId, propertyId, companyId);

        // Business logic
        const flows = await chatbotFlowRepository.findByPropertyId(propertyId, companyId, includeInactive);

        return flows.map(this.toDTO);
    },

    async executeFlow(propertyId: string, userMessage: string): Promise<FlowExecutionResult> {
        // Early validation
        if (!userMessage?.trim()) {
            return { matched: false };
        }

        // Get active flow for property
        const flow = await chatbotFlowRepository.findActiveByProperty(propertyId);
        if (!flow) {
            return { matched: false };
        }

        // Execute flow matching
        return this.matchFlow(flow.flow as Record<string, any>, userMessage.trim().toLowerCase());
    },

    // Flow execution logic
    matchFlow(flow: Record<string, any>, userMessage: string): FlowExecutionResult {
        // Exact matching - only matches if user message exactly matches a trigger
        // Flow structure: { triggers: string[], response: string, nextAction?: string }

        if (!flow.triggers || !Array.isArray(flow.triggers)) {
            return { matched: false };
        }

        // Check if any trigger exactly matches the user message (case-insensitive, trimmed)
        const matchedTrigger = flow.triggers.find((trigger: string) => {
            const normalizedTrigger = trigger.toLowerCase().trim();
            return userMessage === normalizedTrigger;
        });

        if (!matchedTrigger) {
            return { matched: false };
        }

        // Return response if available
        return {
            matched: true,
            response: flow.response || "I understand. How can I help you further?",
            nextAction: flow.nextAction,
        };
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
    toDTO(flow: ChatbotFlow): ChatbotFlowDTO {
        return {
            id: flow.id,
            companyId: flow.companyId,
            propertyId: flow.propertyId,
            name: flow.name,
            description: flow.description,
            flow: flow.flow as Record<string, any>,
            isActive: flow.isActive,
            createdAt: flow.createdAt,
            updatedAt: flow.updatedAt,
        };
    },
};

