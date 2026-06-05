import { z } from "zod";

// Validation error messages - exported for consistency
export const LABEL_ERROR_EMPTY = "Label cannot be empty";
export const LABEL_ERROR_MAX = "Label cannot exceed 50 characters";
export const MESSAGE_ERROR_EMPTY = "Message cannot be empty";
export const MESSAGE_ERROR_MAX = "Message cannot exceed 500 characters";
export const PROPERTY_ID_ERROR = "Property ID is required";
export const ORDER_ERROR = "Order must be a non-negative integer";
export const QUICK_REPLY_ID_ERROR = "Quick reply ID is required";
export const UPDATE_FIELDS_REQUIRED_ERROR = "At least one field (label, message, order, or isActive) must be provided for update";

// Validation constants
export const LABEL_MAX_LENGTH = 50;
export const MESSAGE_MAX_LENGTH = 500;
export const ORDER_MIN_VALUE = 0;

export const createQuickReplySchema = z.object({
    body: z.object({
        propertyId: z.string().trim().min(1, PROPERTY_ID_ERROR),
        label: z
            .string()
            .trim()
            .min(1, LABEL_ERROR_EMPTY)
            .max(LABEL_MAX_LENGTH, LABEL_ERROR_MAX),
        message: z
            .string()
            .trim()
            .min(1, MESSAGE_ERROR_EMPTY)
            .max(MESSAGE_MAX_LENGTH, MESSAGE_ERROR_MAX),
        order: z
            .number()
            .int()
            .nonnegative(ORDER_ERROR)
            .optional(),
        isActive: z
            .boolean()
            .optional()
            .default(true),
    }),
});

export const updateQuickReplySchema = z.object({
    params: z.object({
        id: z.string().trim().min(1, QUICK_REPLY_ID_ERROR),
    }),
    body: z
        .object({
            label: z
                .string()
                .trim()
                .min(1, LABEL_ERROR_EMPTY)
                .max(LABEL_MAX_LENGTH, LABEL_ERROR_MAX)
                .optional(),
            message: z
                .string()
                .trim()
                .min(1, MESSAGE_ERROR_EMPTY)
                .max(MESSAGE_MAX_LENGTH, MESSAGE_ERROR_MAX)
                .optional(),
            order: z
                .number()
                .int()
                .nonnegative(ORDER_ERROR)
                .optional(),
            isActive: z
                .boolean()
                .optional(),
        })
        .refine(
            (data) => {
                // At least one field must be provided for update
                return (
                    data.label !== undefined ||
                    data.message !== undefined ||
                    data.order !== undefined ||
                    data.isActive !== undefined
                );
            },
            {
                message: UPDATE_FIELDS_REQUIRED_ERROR,
            }
        ),
});

export const getQuickRepliesSchema = z.object({
    params: z.object({
        propertyId: z.string().trim().min(1, PROPERTY_ID_ERROR),
    }),
    query: z.object({
        includeInactive: z.string().optional(),
    }),
});

export const deleteQuickReplySchema = z.object({
    params: z.object({
        id: z.string().trim().min(1, QUICK_REPLY_ID_ERROR),
    }),
});

export const getPublicQuickRepliesSchema = z.object({
    query: z.object({
        propertyId: z.string().trim().min(1, PROPERTY_ID_ERROR),
    }),
});

