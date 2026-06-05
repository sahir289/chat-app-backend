import type { Server as IOServer, Socket } from "socket.io";
import type { MessageDTO } from "../types/chat";

export interface SocketRoom {
    chatId?: string;
    propertyId?: string;
    sessionId?: string;
    role: "visitor" | "agent" | "dashboard";
    companyId?: string;
    agentId?: string | null;
}

export interface SocketError {
    code?: string;
    message: string;
    details?: unknown;
}

export interface MessagePayload {
    id: string;
    chatId: string;
    senderType: string;
    text: string;
    createdAt: string;
    section?: string;
    sessionId?: string;
    widgetKey?: string;
    url?: string | null;
    referrer?: string | null;
    userAgent?: string | null;
    device?: string | null;
    browser?: string | null;
    country?: string | null;
    ipAddress?: string | null;
    agentId?: string | null;
    metadata?: any;
    deferAiReply?: boolean;
    clientMessageId?: string;
    replyToClientMessageId?: string;
    quickReplies?: Array<{ id: string; label: string; message: string }>;
    attachments?: Array<{
        id: string;
        fileName: string;
        fileType: string;
        fileSize: number;
        fileUrl: string;
        thumbnailUrl?: string | null;
    }>;
}

export interface JoinPayload {
    chatId?: string;
    propertyId?: string;
    widgetKey?: string;
    sessionId?: string;
    role?: "visitor" | "agent" | "dashboard";
    url?: string | null;
    referrer?: string | null;
    userAgent?: string | null;
    device?: string | null;
    browser?: string | null;
    country?: string | null;
    ipAddress?: string | null;
}

export interface MessageHandlerOptions {
    requiredRole?: SocketRoom["role"];
    defaultSenderType?: "VISITOR" | "AGENT";
}

export interface BroadcastMessageOptions {
    includePropertyRoom?: boolean;
    includeLegacyEvents?: boolean;
}

export interface ChatInfo {
    id: string;
    propertyId: string;
    sessionId: string;
    agentId?: string | null;
}

export interface UnreadLastMessagePayload {
    id: string;
    text: string;
    senderType: string;
    createdAt: string;
}

export interface UnreadUpdatePayload {
    chatId: string;
    sessionId: string;
    chatUnreadCount: number;
    totalUnreadMessages: number;
    totalUnreadChats: number;
    lastMessage: UnreadLastMessagePayload | null;
}

export interface UnreadCountsSyncPayload {
    propertyId: string;
    totalUnreadMessages: number;
    totalUnreadChats: number;
    updates: UnreadUpdatePayload[];
}

export type { IOServer, Socket, MessageDTO };

