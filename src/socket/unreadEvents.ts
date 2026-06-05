import type { Server as IOServer, Socket } from "socket.io";
import { chatRepository } from "../repositories/chatRepository";
import { SOCKET_EVENTS } from "./events";
import { getPropertyRoom } from "./helpers";
import type { UnreadCountsSyncPayload, UnreadUpdatePayload } from "./types";

type UnreadLastMessageOverride = {
    id: string;
    text: string;
    senderType: string;
    createdAt: Date | string;
};

function mapUnreadUpdatePayload(
    payload: {
        chatId: string;
        sessionId: string;
        chatUnreadCount: number;
        lastMessage: {
            id: string;
            text: string;
            senderType: string;
            createdAt: Date;
        } | null;
    },
    totals: {
        totalUnreadMessages: number;
        totalUnreadChats: number;
    }
): UnreadUpdatePayload {
    return {
        chatId: payload.chatId,
        sessionId: payload.sessionId,
        chatUnreadCount: payload.chatUnreadCount,
        totalUnreadMessages: totals.totalUnreadMessages,
        totalUnreadChats: totals.totalUnreadChats,
        lastMessage: payload.lastMessage
            ? {
                id: payload.lastMessage.id,
                text: payload.lastMessage.text,
                senderType: payload.lastMessage.senderType,
                createdAt: payload.lastMessage.createdAt.toISOString(),
            }
            : null,
    };
}

export async function buildUnreadUpdatePayload(chatId: string, companyId?: string): Promise<{
    propertyId: string;
    payload: UnreadUpdatePayload;
} | null> {
    const unreadSnapshot = await chatRepository.getUnreadSnapshotByChatId(chatId, companyId);
    if (!unreadSnapshot) {
        return null;
    }

    const totals = await chatRepository.getUnreadTotalsByProperty(
        unreadSnapshot.propertyId,
        unreadSnapshot.companyId
    );

    return {
        propertyId: unreadSnapshot.propertyId,
        payload: mapUnreadUpdatePayload(
            {
                chatId: unreadSnapshot.chatId,
                sessionId: unreadSnapshot.sessionId,
                chatUnreadCount: unreadSnapshot.chatUnreadCount,
                lastMessage: unreadSnapshot.lastMessage,
            },
            totals
        ),
    };
}

export async function emitUnreadUpdate(
    io: IOServer | null,
    chatId: string,
    companyId?: string,
    lastMessageOverride?: UnreadLastMessageOverride
): Promise<void> {
    if (!io) {
        return;
    }

    const unreadEvent = await buildUnreadUpdatePayload(chatId, companyId);
    if (!unreadEvent) {
        return;
    }

    const effectiveLastMessage =
        lastMessageOverride && unreadEvent.payload.chatUnreadCount > 0
            ? {
                id: lastMessageOverride.id,
                text: lastMessageOverride.text,
                senderType: lastMessageOverride.senderType,
                createdAt: new Date(lastMessageOverride.createdAt).toISOString(),
            }
            : unreadEvent.payload.lastMessage;

    io.to(getPropertyRoom(unreadEvent.propertyId)).emit(SOCKET_EVENTS.UNREAD_COUNT_UPDATED, {
        ...unreadEvent.payload,
        lastMessage: effectiveLastMessage,
    });
}

export async function buildUnreadCountsSyncPayload(
    propertyId: string,
    companyId: string
): Promise<UnreadCountsSyncPayload> {
    const unreadChats = await chatRepository.getUnreadCountsByProperty(propertyId, companyId);
    const totals = await chatRepository.getUnreadTotalsByProperty(propertyId, companyId);

    return {
        propertyId,
        totalUnreadMessages: totals.totalUnreadMessages,
        totalUnreadChats: totals.totalUnreadChats,
        updates: unreadChats.map((chat) => mapUnreadUpdatePayload(chat, totals)),
    };
}

export async function emitUnreadSync(
    socket: Socket,
    propertyId: string,
    companyId: string
): Promise<void> {
    const payload = await buildUnreadCountsSyncPayload(propertyId, companyId);
    socket.emit(SOCKET_EVENTS.UNREAD_COUNTS_SYNC, payload);
}
