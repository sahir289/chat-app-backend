import prisma from "../lib/prisma";
import type { Message, SenderType, Prisma } from "@prisma/client";

/** Avoid FK errors from "" or whitespace-only IDs (DB may reject empty string as FK). */
function normalizeOptionalFk(id: string | null | undefined): string | null {
    if (id == null) return null;
    const t = String(id).trim();
    return t === "" ? null : t;
}

export const messageRepository = {
    async countWithFilters(params: {
        companyId: string;
        propertyId?: string;
        chatIds?: string[];
        startDate?: Date;
        endDate?: Date;
    }): Promise<number> {
        const { companyId, propertyId, chatIds, startDate, endDate } = params;

        if (chatIds && chatIds.length === 0) {
            return 0;
        }

        return prisma.message.count({
            where: {
                deletedAt: null,
                isDeleted: false,
                ...(startDate || endDate
                    ? {
                        createdAt: {
                            ...(startDate ? { gte: startDate } : {}),
                            ...(endDate ? { lt: endDate } : {}),
                        },
                    }
                    : {}),
                chat: {
                    companyId,
                    deletedAt: null,
                    ...(propertyId ? { propertyId } : {}),
                    ...(chatIds ? { id: { in: chatIds } } : {}),
                },
            },
        });
    },

    async create(params: {
        chatId: string;
        senderType: SenderType;
        text: string;
        visitorId?: string | null;
        agentId?: string | null;
        botName?: string | null;
        attachments?: string | null;
        metadata?: string | null;
        clientMessageId?: string | null;
        replyToClientMessageId?: string | null;
    }): Promise<Message> {
        let parsedMetadata: Prisma.InputJsonValue | undefined = undefined;

        if (params.metadata) {
            if (typeof params.metadata === 'string') {
                try {
                    parsedMetadata = JSON.parse(params.metadata) as Prisma.InputJsonValue;
                } catch (error) {
                    // If JSON parsing fails, log error and use undefined
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    parsedMetadata = undefined;
                }
            } else {
                // Already an object, use as-is
                parsedMetadata = params.metadata as Prisma.InputJsonValue;
            }
        }

        return prisma.message.create({
            data: {
                chatId: params.chatId,
                senderType: params.senderType,
                text: params.text,
                visitorId: normalizeOptionalFk(params.visitorId ?? null),
                agentId: normalizeOptionalFk(params.agentId ?? null),
                botName: params.botName ?? null,
                metadata: parsedMetadata,
                clientMessageId: params.clientMessageId?.trim() || null,
                replyToClientMessageId: params.replyToClientMessageId?.trim() || null,
            },
        });
    },

    async listByChat(chatId: string, page = 1, limit = 50): Promise<Message[]> {
        const skip = (page - 1) * limit;

        return prisma.message.findMany({
            where: {
                chatId,
                deletedAt: null,
                isDeleted: false,
            },
            include: {
                attachments: {
                    orderBy: { createdAt: "asc" },
                },
                messageButtons: {
                    orderBy: { order: "asc" },
                },
            },
            orderBy: { createdAt: "asc" },
            skip,
            take: limit,
        });
    },

    async countByChat(chatId: string): Promise<number> {
        try {
            return await prisma.message.count({
                where: {
                    chatId,
                    deletedAt: null,
                    isDeleted: false,
                } as any,
            });
        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            // Return 0 instead of throwing
            return 0;
        }
    },


    async countByChatAndSender(chatId: string, senderType: SenderType): Promise<number> {
        return prisma.message.count({
            where: {
                chatId,
                senderType,
                deletedAt: null,
                isDeleted: false,
            } as any,
        });
    },

    async findByClientMessageId(params: {
        chatId: string;
        senderType: SenderType;
        clientMessageId: string;
    }): Promise<Message | null> {
        return prisma.message.findFirst({
            where: {
                chatId: params.chatId,
                senderType: params.senderType,
                deletedAt: null,
                isDeleted: false,
                OR: [
                    { clientMessageId: params.clientMessageId },
                    {
                        metadata: {
                            path: ["clientMessageId"],
                            equals: params.clientMessageId,
                        },
                    },
                ],
            },
            orderBy: { createdAt: "asc" },
        });
    },

    async findBotReplyByClientMessageId(params: {
        chatId: string;
        clientMessageId: string;
    }): Promise<Message | null> {
        return prisma.message.findFirst({
            where: {
                chatId: params.chatId,
                senderType: "BOT",
                deletedAt: null,
                isDeleted: false,
                OR: [
                    { replyToClientMessageId: params.clientMessageId },
                    {
                        metadata: {
                            path: ["replyToClientMessageId"],
                            equals: params.clientMessageId,
                        },
                    },
                ],
            },
            orderBy: { createdAt: "asc" },
        });
    },

    async findFirstBotAfterMessage(params: {
        chatId: string;
        after: Date;
    }): Promise<Message | null> {
        return prisma.message.findFirst({
            where: {
                chatId: params.chatId,
                senderType: "BOT",
                deletedAt: null,
                isDeleted: false,
                createdAt: {
                    gte: params.after,
                },
            },
            orderBy: { createdAt: "asc" },
        });
    },

    async findById(id: string): Promise<Message | null> {
        return prisma.message.findUnique({
            where: { id },
        });
    },

    /**
     * Shallow-merge keys into Message.metadata (JSON).
     */
    async mergeMetadata(id: string, patch: Record<string, unknown>): Promise<Message> {
        const existing = await prisma.message.findUnique({ where: { id } });
        const meta = (existing?.metadata as Record<string, unknown> | null) ?? {};
        return prisma.message.update({
            where: { id },
            data: {
                metadata: { ...meta, ...patch } as Prisma.InputJsonValue,
            },
        });
    },

    async getChatByMessageId(messageId: string) {
        const message = await prisma.message.findUnique({
            where: { id: messageId },
            select: {
                chat: {
                    select: {
                        id: true,
                        companyId: true,
                    },
                },
            },
        });
        return message?.chat || null;
    },

    /**
     * Get the most recent messages for a chat (for AI context)
     * Returns messages in chronological order (oldest first)
     */
    async getRecentMessages(chatId: string, limit: number = 5): Promise<Message[]> {
        const messages = await prisma.message.findMany({
            where: {
                chatId,
                deletedAt: null,
                isDeleted: false,
            } as any,
            orderBy: { createdAt: "desc" }, // Get most recent first
            take: limit,
        });
        // Reverse to chronological order (oldest first)
        return messages.reverse();
    },

    async update(id: string, data: { messageType?: "TEXT" | "IMAGE" | "FILE" | "BUTTONS" | "CARDS" | "QUICK_REPLIES" | "LOCATION" | "CONTACT" }): Promise<Message> {
        return prisma.message.update({
            where: { id },
            data,
        });
    },

    async edit(id: string, text: string): Promise<Message> {
        return prisma.message.update({
            where: { id },
            data: {
                text,
                editedAt: new Date(),
            },
        });
    },
};

