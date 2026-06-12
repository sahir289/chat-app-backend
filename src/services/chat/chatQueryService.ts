import { chatRepository } from "../../repositories/chatRepository";
import { leadRepository, type LeadSessionSummary } from "../../repositories/leadRepository";
import { messageRepository } from "../../repositories/messageRepository";
import { visitorEventRepository } from "../../repositories/visitorEventRepository";
import { AppError } from "../../utils/appError";
import { isVisitorOnline, getIO } from "../../socket/index";
import { normalizeMessagesLimit } from "../../constants/messagePagination";
import { mapMessageToDto } from "./messageDtoMapper";
import type { DashboardChatItemDTO, MessageDTO, ChatDTO } from "../../types/chat";
import { getLeadVisitorName, getVisitorFirstName } from "../../utils/leadVisitorName";

export type CursorMessagesResult = {
    messages: MessageDTO[];
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
};

function resolveVisitorFullName(input: {
    lead?: { fullName?: string | null } | null;
    visitor?: { name?: string | null } | null;
}): string | null {
    return input.lead?.fullName?.trim() || input.visitor?.name?.trim() || null;
}

function resolveVisitorFirstName(input: {
    lead?: { fullName?: string | null } | null;
    visitor?: { name?: string | null } | null;
}): string | null {
    return getLeadVisitorName(input.lead) ?? getVisitorFirstName(input.visitor?.name);
}

function leadSessionKey(propertyId: string, sessionId: string): string {
    return `${propertyId}:${sessionId}`;
}

function buildLatestLeadBySession(leads: LeadSessionSummary[]): Map<string, LeadSessionSummary> {
    const map = new Map<string, LeadSessionSummary>();
    for (const lead of leads) {
        if (!lead.chat) continue;
        const key = leadSessionKey(lead.chat.propertyId, lead.chat.sessionId);
        if (!map.has(key)) {
            map.set(key, lead);
        }
    }
    return map;
}

export const chatQueryService = {
    async getMessagesCursor(
        chatId: string,
        companyId?: string,
        options: { limit?: number | string; cursor?: string } = {}
    ): Promise<CursorMessagesResult> {
        const chat = await chatRepository.findById(chatId, companyId);
        if (!chat) {
            throw new AppError(404, "Chat not found");
        }

        if (companyId && chat.companyId !== companyId) {
            throw new AppError(403, "Forbidden: Chat does not belong to your company");
        }

        const limit = normalizeMessagesLimit(options.limit);
        const cursor = typeof options.cursor === "string" ? options.cursor.trim() : "";
        const rawMessages = await messageRepository.listByChatCursor(
            chatId,
            limit,
            cursor || undefined
        );

        const hasMore = rawMessages.length > limit;
        const pageMessages = hasMore ? rawMessages.slice(0, limit) : rawMessages;
        const messagesAsc = [...pageMessages].reverse();
        const effectiveCompanyId = companyId || chat.companyId;

        return {
            messages: await Promise.all(
                messagesAsc.map((message) => mapMessageToDto(message, effectiveCompanyId))
            ),
            nextCursor: hasMore && messagesAsc.length > 0 ? messagesAsc[0].id : null,
            hasMore,
            limit,
        };
    },

    async getDashboardChats(companyId: string, propertyId: string): Promise<DashboardChatItemDTO[]> {
        const chats = await chatRepository.listByPropertyWithLastMessage(companyId, propertyId);
        const latestLeadBySession = buildLatestLeadBySession(
            await leadRepository.findLatestByChatSessions({
                companyId,
                propertyIds: [propertyId],
                sessionIds: chats.map((c) => c.sessionId),
            })
        );

        return chats.map((c) => {
            const lead = c.leads?.[0] ?? latestLeadBySession.get(leadSessionKey(c.propertyId, c.sessionId)) ?? null;

            return {
                id: c.id,
                sessionId: c.sessionId,
                visitorName: resolveVisitorFirstName({ lead, visitor: c.visitor }),
                visitorFullName: resolveVisitorFullName({ lead, visitor: c.visitor }),
                status: c.status,
                createdAt: c.createdAt,
                lastMessage:
                    c.messages && c.messages.length > 0 && c.messages[0]
                        ? {
                            id: c.messages[0].id,
                            chatId: c.messages[0].chatId,
                            senderType: c.messages[0].senderType,
                            text: c.messages[0].text || "",
                            createdAt: c.messages[0].createdAt,
                        }
                        : null,
            };
        });
    },

    async getInbox(companyId: string, propertyId?: string, currentUserId?: string): Promise<Array<{
        id: string;
        sessionId: string;
        status: string;
        propertyId: string;
        agentId: string | null;
        agent: { id: string; name: string | null; email: string } | null;
        visitorName: string | null;
        visitorFullName: string | null;
        lead: { id: string; fullName: string } | null;
        lastMessage: MessageDTO | null;
        hasUnread: boolean;
        unreadCount: number;
        isOnline?: boolean;
        visitor?: { device?: string | null; browser?: string | null; country?: string | null; url?: string | null } | null;
        createdAt: Date;
    }>> {
        const chats = await chatRepository.listHistory(companyId, propertyId, 200, 0);
        const latestLeadBySession = buildLatestLeadBySession(
            await leadRepository.findLatestByChatSessions({
                companyId,
                propertyIds: propertyId ? [propertyId] : undefined,
                sessionIds: chats.map((c) => c.sessionId),
            })
        );

        const onlineChatIds = new Set<string>();
        const io = getIO();
        await Promise.all(
            chats.map(async (c) => {
                if (await isVisitorOnline(c.id, io)) {
                    onlineChatIds.add(c.id);
                }
            })
        );

        const chatIds = chats.map((c) => c.id);
        const visitorInfoMap = await visitorEventRepository.getVisitorInfoByChatIds(chatIds, companyId);

        const items = chats.map((c) => {
            const last = c.messages && c.messages.length > 0 ? c.messages[0] : null;
            const unreadCount = c.unreadCount ?? 0;
            const hasUnread = unreadCount > 0;

            const visitorEvent = visitorInfoMap[c.id];
            const visitorInfo = visitorEvent
                ? {
                    url: visitorEvent.url,
                    referrer: visitorEvent.referrer,
                    userAgent: visitorEvent.userAgent,
                    device: visitorEvent.device,
                    browser: visitorEvent.browser,
                    country: visitorEvent.country,
                    ipAddress: visitorEvent.ipAddress,
                }
                : null;

            const lead = c.leads?.[0] ?? latestLeadBySession.get(leadSessionKey(c.propertyId, c.sessionId)) ?? null;

            return {
                id: c.id,
                sessionId: c.sessionId,
                visitorName: resolveVisitorFirstName({ lead, visitor: c.visitor }),
                visitorFullName: resolveVisitorFullName({ lead, visitor: c.visitor }),
                lead: c.leads?.[0] ?? null,
                status: c.status,
                propertyId: c.propertyId,
                agentId: c.agentId ?? null,
                agent: c.agent
                    ? {
                        id: c.agent.id,
                        name: c.agent.name,
                        email: c.agent.email,
                    }
                    : null,
                lastMessage: last
                    ? {
                        id: last.id,
                        chatId: last.chatId,
                        senderType: last.senderType,
                        text: last.text || "",
                        createdAt: last.createdAt,
                    }
                    : null,
                hasUnread,
                unreadCount,
                isOnline: onlineChatIds.has(c.id),
                visitor: visitorInfo
                    ? {
                        device: visitorInfo.device,
                        browser: visitorInfo.browser,
                        country: visitorInfo.country,
                        url: visitorInfo.url,
                    }
                    : null,
                createdAt: c.createdAt,
            };
        });

        items.sort((a, b) => {
            if (a.hasUnread === b.hasUnread) {
                const aDate = a.lastMessage?.createdAt ?? a.createdAt;
                const bDate = b.lastMessage?.createdAt ?? b.createdAt;
                return bDate.getTime() - aDate.getTime();
            }
            return a.hasUnread ? -1 : 1;
        });

        return items;
    },

    async getVisitorInfo(chatId: string, companyId?: string): Promise<{
        url: string | null;
        referrer: string | null;
        userAgent: string | null;
        device: string | null;
        browser: string | null;
        country: string | null;
        ipAddress: string | null;
    } | null> {
        const event = await visitorEventRepository.getVisitorInfoByChatId(chatId, companyId);

        if (!event) {
            return null;
        }

        return {
            url: event.url,
            referrer: event.referrer,
            userAgent: event.userAgent,
            device: event.device,
            browser: event.browser,
            country: event.country,
            ipAddress: event.ipAddress,
        };
    },

    async getChatById(chatId: string, companyId: string): Promise<ChatDTO> {
        const chat = await chatRepository.findById(chatId, companyId);
        if (!chat) {
            throw new AppError(404, "Chat not found");
        }

        return {
            id: chat.id,
            propertyId: chat.propertyId,
            sessionId: chat.sessionId,
            status: chat.status,
            createdAt: chat.createdAt,
        };
    },

    async getChatHistory(
        companyId: string,
        propertyId?: string,
        limit: number = 50,
        offset: number = 0
    ): Promise<DashboardChatItemDTO[]> {
        const chats = await chatRepository.listHistory(companyId, propertyId, limit, offset);
        const latestLeadBySession = buildLatestLeadBySession(
            await leadRepository.findLatestByChatSessions({
                companyId,
                propertyIds: propertyId ? [propertyId] : undefined,
                sessionIds: chats.map((c) => c.sessionId),
            })
        );

        return chats.map((c) => {
            const lead = c.leads?.[0] ?? latestLeadBySession.get(leadSessionKey(c.propertyId, c.sessionId)) ?? null;

            return {
                id: c.id,
                sessionId: c.sessionId,
                visitorName: resolveVisitorFirstName({ lead, visitor: c.visitor }),
                visitorFullName: resolveVisitorFullName({ lead, visitor: c.visitor }),
                status: c.status,
                createdAt: c.createdAt,
                lastMessage:
                    c.messages && c.messages.length > 0 && c.messages[0]
                        ? {
                            id: c.messages[0].id,
                            chatId: c.messages[0].chatId,
                            senderType: c.messages[0].senderType,
                            text: c.messages[0].text || "",
                            createdAt: c.messages[0].createdAt,
                        }
                        : null,
            };
        });
    },
};
