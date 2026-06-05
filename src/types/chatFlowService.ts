export interface ChatbotFlowDTO {
    id: string;
    companyId: string;
    propertyId: string;
    name: string;
    description: string | null;
    flow: Record<string, any>;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateChatbotFlowParams {
    userId: string;
    companyId: string;
    propertyId: string;
    name: string;
    description?: string;
    flow: Record<string, any>;
    isActive?: boolean;
}

export interface UpdateChatbotFlowParams {
    userId: string;
    companyId: string;
    flowId: string;
    name?: string;
    description?: string;
    flow?: Record<string, any>;
    isActive?: boolean;
}

export interface FlowExecutionResult {
    matched: boolean;
    response?: string;
    nextAction?: string;
}