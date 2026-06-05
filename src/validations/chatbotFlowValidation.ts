import { z } from "zod";

// Validation error messages - exported for consistency
export const NAME_ERROR_EMPTY = "Flow name cannot be empty";
export const NAME_ERROR_MAX = "Flow name cannot exceed 100 characters";
export const FLOW_ERROR_REQUIRED = "Flow is required";
export const FLOW_ERROR_OBJECT = "Flow must be a valid object";
export const FLOW_TRIGGERS_ERROR = "Flow must have a 'triggers' array";
export const FLOW_TRIGGERS_EMPTY = "Flow must have at least one trigger";
export const TRIGGER_ERROR_MAX = "Trigger cannot exceed 200 characters";
export const FLOW_RESPONSE_ERROR = "Flow must have a 'response' string";
export const FLOW_RESPONSE_ERROR_MAX = "Response cannot exceed 500 characters";
export const PROPERTY_ID_ERROR = "Property ID is required";
export const CHATBOT_FLOW_ID_ERROR = "Chatbot flow ID is required";
export const UPDATE_FIELDS_REQUIRED_ERROR = "At least one field (name, description, flow, or isActive) must be provided for update";

// Validation constants
export const NAME_MAX_LENGTH = 100;
export const DESCRIPTION_MAX_LENGTH = 500;
export const TRIGGER_MAX_LENGTH = 200;
export const RESPONSE_MAX_LENGTH = 500;

// Flow structure validation schema
const flowStructureSchema = z.object({
    triggers: z
        .array(
            z
                .string()
                .trim()
                .min(1, "Trigger cannot be empty")
                .max(TRIGGER_MAX_LENGTH, TRIGGER_ERROR_MAX)
        )
        .min(1, FLOW_TRIGGERS_EMPTY),
    response: z
        .string()
        .trim()
        .min(1, FLOW_RESPONSE_ERROR)
        .max(RESPONSE_MAX_LENGTH, FLOW_RESPONSE_ERROR_MAX),
    nextAction: z.string().optional(),
});

export const createChatbotFlowSchema = z.object({
    body: z.object({
        propertyId: z.string().trim().min(1, PROPERTY_ID_ERROR),
        name: z
            .string()
            .trim()
            .min(1, NAME_ERROR_EMPTY)
            .max(NAME_MAX_LENGTH, NAME_ERROR_MAX),
        description: z
            .string()
            .trim()
            .max(DESCRIPTION_MAX_LENGTH, "Description cannot exceed 500 characters")
            .optional()
            .nullable(),
        flow: flowStructureSchema,
        isActive: z
            .boolean()
            .optional()
            .default(true),
    }),
});

export const updateChatbotFlowSchema = z.object({
    params: z.object({
        id: z.string().trim().min(1, CHATBOT_FLOW_ID_ERROR),
    }),
    body: z
        .object({
            name: z
                .string()
                .trim()
                .min(1, NAME_ERROR_EMPTY)
                .max(NAME_MAX_LENGTH, NAME_ERROR_MAX)
                .optional(),
            description: z
                .string()
                .trim()
                .max(DESCRIPTION_MAX_LENGTH, "Description cannot exceed 500 characters")
                .optional()
                .nullable(),
            flow: flowStructureSchema.optional(),
            isActive: z
                .boolean()
                .optional(),
        })
        .refine(
            (data) => {
                // At least one field must be provided for update
                return (
                    data.name !== undefined ||
                    data.description !== undefined ||
                    data.flow !== undefined ||
                    data.isActive !== undefined
                );
            },
            {
                message: UPDATE_FIELDS_REQUIRED_ERROR,
            }
        ),
});

export const getChatbotFlowsSchema = z.object({
    params: z.object({
        propertyId: z.string().trim().min(1, PROPERTY_ID_ERROR),
    }),
    query: z.object({
        includeInactive: z.string().optional(),
    }),
});

export const deleteChatbotFlowSchema = z.object({
    params: z.object({
        id: z.string().trim().min(1, CHATBOT_FLOW_ID_ERROR),
    }),
});

