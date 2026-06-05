import { z } from "zod";

const QUESTION_ERROR_EMPTY = "Question cannot be empty";
const QUESTION_ERROR_MAX = "Question cannot exceed 150 characters";
const ANSWER_ERROR_EMPTY = "Answer cannot be empty";
const ANSWER_ERROR_MAX = "Answer cannot exceed 500 characters";
const PROPERTY_ID_ERROR = "Property ID is required";
const ORDER_ERROR = "Order must be a non-negative integer";

export const createFAQSchema = z.object({
    body: z.object({
        propertyId: z.string().trim().min(1, PROPERTY_ID_ERROR),
        question: z
            .string()
            .trim()
            .min(1, QUESTION_ERROR_EMPTY)
            .max(150, QUESTION_ERROR_MAX),
        answer: z
            .string()
            .trim()
            .min(1, ANSWER_ERROR_EMPTY)
            .max(500, ANSWER_ERROR_MAX),
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

export const updateFAQSchema = z.object({
    params: z.object({
        id: z.string().trim().min(1, "FAQ ID is required"),
    }),
    body: z
        .object({
            question: z
                .string()
                .trim()
                .min(1, QUESTION_ERROR_EMPTY)
                .max(150, QUESTION_ERROR_MAX)
                .optional(),
            answer: z
                .string()
                .trim()
                .min(1, ANSWER_ERROR_EMPTY)
                .max(500, ANSWER_ERROR_MAX)
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
                    data.question !== undefined ||
                    data.answer !== undefined ||
                    data.order !== undefined ||
                    data.isActive !== undefined
                );
            },
            {
                message: "At least one field (question, answer, order, or isActive) must be provided for update",
            }
        ),
});

export const getFAQsSchema = z.object({
    params: z.object({
        propertyId: z.string().trim().min(1, PROPERTY_ID_ERROR),
    }),
    query: z.object({
        includeInactive: z.string().optional(),
    }),
});

export const deleteFAQSchema = z.object({
    params: z.object({
        id: z.string().trim().min(1, "FAQ ID is required"),
    }),
});

export const searchFAQsSchema = z.object({
    params: z.object({
        propertyId: z.string().trim().min(1, PROPERTY_ID_ERROR),
    }),
    query: z.object({
        query: z.string().trim().min(1, "Search query is required"),
        limit: z.string().regex(/^\d+$/, "Limit must be a positive integer").optional(),
    }),
});

