import prisma from "../lib/prisma";
import type { VisitorEvent } from "@prisma/client";
import { getIO } from "../socket/index";
import { emitVisitorUpdate } from "../socket/helpers";
export const visitorEventRepository = {
    async create(data: {
        companyId: string;
        propertyId: string;
        chatId?: string | null;
        visitorId?: string | null;
        sessionId: string;
        eventType: string;
        url?: string | null;
        referrer?: string | null;
        userAgent?: string | null;
        device?: string | null;
        browser?: string | null;
        country?: string | null;
        ipAddress?: string | null;
    }): Promise<VisitorEvent> {
        // Update visitor's lastSeen
        const now = new Date();

        if (data.visitorId) {
            // If visitorId is provided, update directly
            await prisma.visitor.updateMany({
                where: {
                    id: data.visitorId,
                    companyId: data.companyId,
                },
                data: {
                    lastSeen: now,
                },
            });
        } else {
            // If visitorId is not provided, try to find visitor by sessionId and update
            await prisma.visitor.updateMany({
                where: {
                    sessionId: data.sessionId,
                    companyId: data.companyId,
                },
                data: {
                    lastSeen: now,
                },
            });
        }

        // Emit socket event for real-time updates (non-blocking)
        try {
            const io = getIO();
            emitVisitorUpdate(io, data.propertyId, data.sessionId, now);
        } catch (err) {
            // Silently fail if socket is not initialized (e.g., during tests)
            // This is expected behavior
        }

        return prisma.visitorEvent.create({
            data: {
                companyId: data.companyId,
                propertyId: data.propertyId,
                chatId: data.chatId ?? null,
                visitorId: data.visitorId ?? null,
                sessionId: data.sessionId,
                visitorToken: data.sessionId,
                eventType: data.eventType,
                url: data.url ?? null,
                referrer: data.referrer ?? null,
                userAgent: data.userAgent ?? null,
                device: data.device ?? null,
                browser: data.browser ?? null,
                country: data.country ?? null,
                ipAddress: data.ipAddress ?? null,
            },
        });
    },

    async countByPropertyAndType(
        companyId: string,
        propertyId: string,
        eventType: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<number> {
        return prisma.visitorEvent.count({
            where: {
                companyId,
                propertyId,
                eventType,
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

    async listByProperty(
        companyId: string,
        propertyId: string,
        limit = 100
    ): Promise<VisitorEvent[]> {
        return prisma.visitorEvent.findMany({
            where: { propertyId, companyId },
            orderBy: { createdAt: "desc" },
            take: limit,
        });
    },

    async getVisitorInfoByChatId(chatId: string, companyId?: string): Promise<VisitorEvent | null> {
        try {
            // First verify the chat exists and is not deleted
            const chat = await prisma.chat.findFirst({
                where: {
                    id: chatId,
                    deletedAt: null,
                    ...(companyId ? { companyId } : {}),
                },
                select: {
                    id: true,
                    companyId: true,
                    propertyId: true,
                    sessionId: true,
                },
            });

            if (!chat) {
                // Chat doesn't exist or is deleted, return null
                return null;
            }

            // Get the most recent event with visitor info for this chat
            // Try chat_start first, then any event with device/browser info
            const chatStartEvent = await prisma.visitorEvent.findFirst({
                where: {
                    chatId,
                    ...(companyId ? { companyId } : {}),
                    eventType: "chat_start",
                },
                orderBy: { createdAt: "desc" },
            });

            // If we found a chat_start event with data, return it
            if (chatStartEvent && (chatStartEvent.device || chatStartEvent.browser || chatStartEvent.ipAddress)) {
                return chatStartEvent;
            }

            // Otherwise, find the most recent event with any visitor info
            const eventWithInfo = await prisma.visitorEvent.findFirst({
                where: {
                    chatId,
                    ...(companyId ? { companyId } : {}),
                    OR: [
                        { device: { not: null } },
                        { browser: { not: null } },
                        { ipAddress: { not: null } },
                        { url: { not: null } },
                    ],
                },
                orderBy: { createdAt: "desc" },
            });

            if (eventWithInfo || chatStartEvent) {
                return eventWithInfo || chatStartEvent;
            }

            // Older/lazy-created chats may only have tracking stored by session/property.
            return await prisma.visitorEvent.findFirst({
                where: {
                    companyId: chat.companyId,
                    propertyId: chat.propertyId,
                    sessionId: chat.sessionId,
                    OR: [
                        { eventType: "chat_start" },
                        { device: { not: null } },
                        { browser: { not: null } },
                        { ipAddress: { not: null } },
                        { url: { not: null } },
                        { referrer: { not: null } },
                        { userAgent: { not: null } },
                        { country: { not: null } },
                    ],
                },
                orderBy: { createdAt: "desc" },
            });
        } catch (error) {
            // Return null instead of throwing to prevent breaking the chat detail page
            return null;
        }
    },

    async listBySession(sessionId: string, companyId: string): Promise<VisitorEvent[]> {
        return prisma.visitorEvent.findMany({
            where: {
                sessionId,
                companyId,
            },
            orderBy: { createdAt: "asc" },
        });
    },

    async getVisitorInfoByChatIds(chatIds: string[], companyId?: string): Promise<Record<string, VisitorEvent>> {
        if (chatIds.length === 0) {
            return {};
        }

        try {
            // Get visitor info for multiple chats in a single query
            const events = await prisma.visitorEvent.findMany({
                where: {
                    chatId: { in: chatIds },
                    ...(companyId ? { companyId } : {}),
                    OR: [
                        { eventType: "chat_start" },
                        { device: { not: null } },
                        { browser: { not: null } },
                        { ipAddress: { not: null } },
                        { url: { not: null } },
                    ],
                },
                orderBy: [
                    { chatId: "asc" },
                    { createdAt: "desc" },
                ],
            });

            // Group by chatId and take the most recent event for each chat
            const result: Record<string, VisitorEvent> = {};
            for (const event of events) {
                if (event.chatId && !(event.chatId in result)) {
                    result[event.chatId] = event;
                }
            }

            return result;
        } catch (error) {
            // Return empty object instead of throwing to prevent breaking the inbox
            return {};
        }
    },

    /**
     * Batch fetch all events for multiple sessions
     * Returns a record of sessionId -> events array
     */
    async listBySessions(sessionIds: string[], companyId: string): Promise<Record<string, VisitorEvent[]>> {
        if (sessionIds.length === 0) {
            return {};
        }

        try {
            const events = await prisma.visitorEvent.findMany({
                where: {
                    sessionId: { in: sessionIds },
                    companyId,
                },
                orderBy: { createdAt: "asc" },
            });

            // Group events by sessionId
            const result: Record<string, VisitorEvent[]> = {};
            for (const event of events) {
                if (!result[event.sessionId]) {
                    result[event.sessionId] = [];
                }
                result[event.sessionId].push(event);
            }

            // Ensure all sessionIds have an entry (even if empty)
            for (const sessionId of sessionIds) {
                if (!(sessionId in result)) {
                    result[sessionId] = [];
                }
            }

            return result;
        } catch (error) {
            // Return empty object with all sessionIds on error
            const result: Record<string, VisitorEvent[]> = {};
            for (const sessionId of sessionIds) {
                result[sessionId] = [];
            }
            return result;
        }
    },
};

