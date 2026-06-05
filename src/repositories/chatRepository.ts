import prisma from "../lib/prisma";
import type { Chat, Message, SenderType, ChatStatus } from "@prisma/client";

type UnreadLastMessage = {
    id: string;
    text: string;
    senderType: SenderType;
    createdAt: Date;
};

type UnreadChatSnapshot = {
    chatId: string;
    propertyId: string;
    companyId: string;
    sessionId: string;
    chatUnreadCount: number;
    lastMessage: UnreadLastMessage | null;
};

export const chatRepository = {
    async findById(id: string, companyId?: string): Promise<Chat | null> {
        return prisma.chat.findFirst({
            where: {
                id,
                ...(companyId ? { companyId } : {}),
                deletedAt: null,
            },
        });
    },

    /** Most recently created chat for this session (any status). */
    async findLatestByPropertyAndSession(params: {
        propertyId: string;
        sessionId: string;
    }): Promise<Chat | null> {
        return prisma.chat.findFirst({
            where: {
                propertyId: params.propertyId,
                sessionId: params.sessionId,
                deletedAt: null,
            },
            orderBy: { createdAt: "desc" },
        });
    },

    /** Current open conversation for this widget session (at most one ACTIVE). */
    async findActiveByPropertyAndSession(params: {
        propertyId: string;
        sessionId: string;
    }): Promise<Chat | null> {
        return prisma.chat.findFirst({
            where: {
                propertyId: params.propertyId,
                sessionId: params.sessionId,
                deletedAt: null,
                status: "ACTIVE",
            },
            orderBy: { createdAt: "desc" },
        });
    },

    /** Latest reusable widget conversation for this session (open or feedback-pending). */
    async findReusableByPropertyAndSession(params: {
        propertyId: string;
        sessionId: string;
    }): Promise<Chat | null> {
        return prisma.chat.findFirst({
            where: {
                propertyId: params.propertyId,
                sessionId: params.sessionId,
                deletedAt: null,
                status: {
                    in: ["ACTIVE", "WAITING"],
                },
            },
            orderBy: { createdAt: "desc" },
        });
    },

    /** @deprecated Prefer findLatestByPropertyAndSession or findActiveByPropertyAndSession */
    async findFirstByPropertyAndSession(params: {
        propertyId: string;
        sessionId: string;
    }): Promise<Chat | null> {
        return this.findLatestByPropertyAndSession(params);
    },

    async findBySessionId(sessionId: string, companyId: string): Promise<Chat[]> {
        return prisma.chat.findMany({
            where: {
                sessionId,
                companyId,
                deletedAt: null,
            },
            orderBy: { createdAt: "desc" },
        });
    },

    /** All chats for a widget visitor session on one property (newest first). */
    async listByPropertyAndSession(params: {
        propertyId: string;
        sessionId: string;
    }): Promise<Chat[]> {
        return prisma.chat.findMany({
            where: {
                propertyId: params.propertyId,
                sessionId: params.sessionId,
                deletedAt: null,
            },
            orderBy: { createdAt: "desc" },
        });
    },

    async create(params: {
        companyId: string;
        propertyId: string;
        sessionId: string;
        visitorId?: string | null;
        /** Defaults to sessionId (widget visitor token). */
        visitorToken?: string;
    }): Promise<Chat> {
        const visitorToken = params.visitorToken ?? params.sessionId;
        return prisma.chat.create({
            data: {
                companyId: params.companyId,
                propertyId: params.propertyId,
                sessionId: params.sessionId,
                visitorToken,
                visitorId: params.visitorId ?? null,
                status: "ACTIVE",
            },
        });
    },

    async listByPropertyWithLastMessage(
        companyId: string,
        propertyId: string
    ): Promise<(Chat & { messages: Message[] })[]> {
        return prisma.chat.findMany({
            where: {
                companyId,
                propertyId,
                deletedAt: null,
            },
            orderBy: { createdAt: "desc" },
            include: {
                messages: {
                    where: {
                        deletedAt: null,
                        isDeleted: false,
                    },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                },
            },
        });
    },

    async createMessage(params: {
        chatId: string;
        senderType: SenderType;
        text: string;
    }): Promise<Message> {
        return prisma.message.create({
            data: {
                chatId: params.chatId,
                senderType: params.senderType,
                text: params.text,
            },
        });
    },

    async listMessagesByChat(chatId: string, companyId?: string): Promise<Message[]> {
        // Messages don't have companyId directly, so we scope through chat
        const where: any = {
            chatId,
            deletedAt: null,
            isDeleted: false,
        };

        if (companyId) {
            // Scope through chat relationship
            where.chat = {
                companyId,
                deletedAt: null,
            };
        }

        return prisma.message.findMany({
            where,
            orderBy: { createdAt: "asc" },
        });
    },

    /** Messages for widget transcript (attachments + quick replies). Scoped to company via chat. */
    async listMessagesForTranscript(chatId: string, companyId: string) {
        return prisma.message.findMany({
            where: {
                chatId,
                deletedAt: null,
                isDeleted: false,
                chat: {
                    companyId,
                    deletedAt: null,
                },
            },
            orderBy: { createdAt: "asc" },
            include: {
                attachments: true,
                messageQuickReplies: {
                    orderBy: { order: "asc" },
                },
            },
        });
    },

    async countByProperty(companyId: string, propertyId: string): Promise<number> {
        return prisma.chat.count({
            where: {
                companyId,
                propertyId,
                deletedAt: null,
            },
        });
    },

    async countByPropertyAndDateRange(
        companyId: string,
        propertyId: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<number> {
        return prisma.chat.count({
            where: {
                companyId,
                propertyId,
                deletedAt: null,
                ...(startDate || endDate
                    ? {
                        createdAt: {
                            ...(startDate ? { gte: startDate } : {}),
                            ...(endDate ? { lt: endDate } : {}),
                        },
                    }
                    : {}),
            },
        });
    },

    async countByPropertyAndStatus(
        companyId: string,
        propertyId: string,
        status: ChatStatus
    ): Promise<number> {
        return prisma.chat.count({
            where: {
                companyId,
                propertyId,
                status,
                deletedAt: null,
            },
        });
    },

    async countByPropertyAndStatusAndDateRange(
        companyId: string,
        propertyId: string,
        status: ChatStatus,
        startDate?: Date,
        endDate?: Date
    ): Promise<number> {
        return prisma.chat.count({
            where: {
                companyId,
                propertyId,
                status,
                deletedAt: null,
                ...(startDate || endDate
                    ? {
                        createdAt: {
                            ...(startDate ? { gte: startDate } : {}),
                            ...(endDate ? { lt: endDate } : {}),
                        },
                    }
                    : {}),
            },
        });
    },

    async countTodayByProperty(companyId: string, propertyId: string): Promise<number> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        return prisma.chat.count({
            where: {
                companyId,
                propertyId,
                deletedAt: null,
                createdAt: {
                    gte: today,
                    lt: tomorrow,
                },
            },
        });
    },

    async getAverageResponseTime(
        companyId: string,
        propertyId: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<number | null> {
        // Use raw SQL for better performance with large datasets
        // This calculates average response time directly in the database
        // Note: Prisma uses camelCase column names in PostgreSQL
        let dateFilter = "";
        const params: any[] = [companyId, propertyId];

        if (startDate || endDate) {
            if (startDate && endDate) {
                dateFilter = `AND c."createdAt" >= $3 AND c."createdAt" < $4`;
                params.push(startDate, endDate);
            } else if (startDate) {
                dateFilter = `AND c."createdAt" >= $3`;
                params.push(startDate);
            } else if (endDate) {
                dateFilter = `AND c."createdAt" < $3`;
                params.push(endDate);
            }
        }

        const result = await prisma.$queryRawUnsafe<Array<{ avg_response_time: number | null }>>(
            `
            WITH visitor_messages AS (
                SELECT 
                    m1."chatId",
                    m1."createdAt" as visitor_time,
                    MIN(m2."createdAt") as response_time
                FROM "Message" m1
                INNER JOIN "Message" m2 ON m1."chatId" = m2."chatId"
                INNER JOIN "Chat" c ON m1."chatId" = c.id
                WHERE 
                    c."companyId" = $1
                    AND c."propertyId" = $2
                    AND c."deletedAt" IS NULL
                    AND m1."deletedAt" IS NULL
                    AND m2."deletedAt" IS NULL
                    AND m1."senderType" = 'VISITOR'
                    AND m2."senderType" IN ('BOT', 'AGENT')
                    AND m2."createdAt" > m1."createdAt"
                    ${dateFilter}
                GROUP BY m1."chatId", m1."createdAt"
            )
            SELECT 
                ROUND(AVG(EXTRACT(EPOCH FROM (response_time - visitor_time)))::numeric) as avg_response_time
            FROM visitor_messages
            `,
            ...params
        );

        const avgTime = result[0]?.avg_response_time;
        return avgTime ? Math.round(avgTime) : null;
    },

    async updateStatus(chatId: string, status: ChatStatus): Promise<Chat> {
        return prisma.chat.update({
            where: { id: chatId },
            data: { status },
        });
    },

    async assignAgent(chatId: string, agentId: string): Promise<Chat> {
        return prisma.chat.update({
            where: { id: chatId },
            data: { agentId },
        });
    },

    async softDeleteById(id: string): Promise<Chat> {
        return prisma.chat.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
    },

    async softDeleteByPropertyId(propertyId: string): Promise<number> {
        const result = await prisma.chat.updateMany({
            where: {
                propertyId,
                deletedAt: null,
            },
            data: { deletedAt: new Date() },
        });
        return result.count;
    },

    async findManyWithFilters(
        where: any,
        skip: number,
        take: number
    ): Promise<(Chat & {
        visitor: {
            id: string;
            sessionId: string;
            device: string | null;
            browser: string | null;
            country: string | null;
        } | null;
        agent: {
            id: string;
            name: string | null;
            email: string;
        } | null;
        messages: Message[];
    })[]> {
        return prisma.chat.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip,
            take,
            include: {
                visitor: {
                    select: {
                        id: true,
                        sessionId: true,
                        device: true,
                        browser: true,
                        country: true,
                    },
                },
                agent: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                messages: {
                    where: {
                        deletedAt: null,
                        isDeleted: false,
                    },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                },
            },
        });
    },

    async countWithFilters(where: any): Promise<number> {
        return prisma.chat.count({ where });
    },

    async listHistory(
        companyId: string,
        propertyId?: string,
        limit: number = 50,
        offset: number = 0
    ): Promise<(Chat & {
        messages: Message[];
        agent: {
            id: string;
            name: string | null;
            email: string;
        } | null;
    })[]> {
        return prisma.chat.findMany({
            where: {
                companyId,
                ...(propertyId ? { propertyId } : {}),
                deletedAt: null,
            },
            orderBy: { createdAt: "desc" },
            take: limit,
            skip: offset,
            include: {
                agent: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                messages: {
                    where: {
                        deletedAt: null,
                        isDeleted: false,
                    },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                },
            },
        });
    },

    async update(
        chatId: string,
        companyId: string,
        data: {
            agentId?: string | null;
            visitorId?: string | null;
            status?: ChatStatus;
            aiEnabled?: boolean;
            firstMessageAt?: Date;
            lastMessageAt?: Date;
            assignedAt?: Date | null;
            closedAt?: Date | null;
            unreadCount?: number;
        }
    ): Promise<Chat> {
        return prisma.chat.update({
            where: { id: chatId, companyId },
            data,
        });
    },

    async incrementUnreadCount(chatId: string): Promise<Chat> {
        return prisma.chat.update({
            where: { id: chatId },
            data: {
                unreadCount: {
                    increment: 1,
                },
            },
        });
    },

    async resetUnreadCount(chatId: string, companyId: string): Promise<Chat> {
        return prisma.chat.update({
            where: { id: chatId, companyId },
            data: {
                unreadCount: 0,
            },
        });
    },

    async getUnreadCountsByProperty(propertyId: string, companyId: string): Promise<Array<{
        chatId: string;
        sessionId: string;
        chatUnreadCount: number;
        lastMessage: UnreadLastMessage | null;
    }>> {
        const chats = await prisma.chat.findMany({
            where: {
                propertyId,
                companyId,
                deletedAt: null,
                unreadCount: {
                    gt: 0,
                },
            },
            select: {
                id: true,
                sessionId: true,
                unreadCount: true,
                messages: {
                    where: {
                        deletedAt: null,
                        isDeleted: false,
                        senderType: {
                            not: "BOT",
                        },
                    },
                    orderBy: {
                        createdAt: "desc",
                    },
                    take: 1,
                    select: {
                        id: true,
                        text: true,
                        senderType: true,
                        createdAt: true,
                    },
                },
            },
        });

        return chats.map((chat) => ({
            chatId: chat.id,
            sessionId: chat.sessionId,
            chatUnreadCount: chat.unreadCount,
            lastMessage: chat.messages[0]
                ? {
                    id: chat.messages[0].id,
                    text: chat.messages[0].text || "",
                    senderType: chat.messages[0].senderType,
                    createdAt: chat.messages[0].createdAt,
                }
                : null,
        }));
    },

    async getUnreadSnapshotByChatId(chatId: string, companyId?: string): Promise<UnreadChatSnapshot | null> {
        const chat = await prisma.chat.findFirst({
            where: {
                id: chatId,
                ...(companyId ? { companyId } : {}),
                deletedAt: null,
            },
            select: {
                id: true,
                propertyId: true,
                companyId: true,
                sessionId: true,
                unreadCount: true,
                messages: {
                    where: {
                        deletedAt: null,
                        isDeleted: false,
                        senderType: {
                            not: "BOT",
                        },
                    },
                    orderBy: {
                        createdAt: "desc",
                    },
                    take: 1,
                    select: {
                        id: true,
                        text: true,
                        senderType: true,
                        createdAt: true,
                    },
                },
            },
        });

        if (!chat) {
            return null;
        }

        return {
            chatId: chat.id,
            propertyId: chat.propertyId,
            companyId: chat.companyId,
            sessionId: chat.sessionId,
            chatUnreadCount: chat.unreadCount,
            lastMessage: chat.messages[0]
                ? {
                    id: chat.messages[0].id,
                    text: chat.messages[0].text || "",
                    senderType: chat.messages[0].senderType,
                    createdAt: chat.messages[0].createdAt,
                }
                : null,
        };
    },

    async getUnreadTotalsByProperty(propertyId: string, companyId: string): Promise<{
        totalUnreadMessages: number;
        totalUnreadChats: number;
    }> {
        const unreadAggregate = await prisma.chat.aggregate({
            where: {
                propertyId,
                companyId,
                deletedAt: null,
                unreadCount: {
                    gt: 0,
                },
            },
            _sum: {
                unreadCount: true,
            },
            _count: {
                _all: true,
            },
        });

        return {
            totalUnreadMessages: unreadAggregate._sum.unreadCount ?? 0,
            totalUnreadChats: unreadAggregate._count._all ?? 0,
        };
    },
};

