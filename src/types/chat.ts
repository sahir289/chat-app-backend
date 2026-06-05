import type { SenderType } from "@prisma/client";

export type SenderKind = SenderType | "VISITOR" | "BOT" | "AGENT";

export interface ChatDTO {
    id: string;
    propertyId: string;
    sessionId: string;
    status: string; // Can be "ACTIVE" | "CLOSED" | "ARCHIVED" as string for compatibility
    createdAt: Date;
}

export interface AttachmentDTO {
    id: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    fileUrl: string;
    thumbnailUrl: string | null;
    createdAt: Date;
}

export interface QuickReplyDTO {
    id: string;
    label: string;
    message: string;
}

export interface MessageButtonDTO {
    id: string;
    label: string;
    value: string;
    type: string;
    url?: string | null;
    payload?: string | null;
    order: number;
}

export interface MessageDTO {
    id: string;
    chatId: string;
    senderType: SenderKind;
    text: string;
    createdAt: Date;
    attachments?: AttachmentDTO[];
    quickReplies?: QuickReplyDTO[];
    metadata?: any;
    clientMessageId?: string | null;
    replyToClientMessageId?: string | null;
    buttons?: MessageButtonDTO[];
}

export interface DashboardChatItemDTO {
    id: string;
    sessionId: string;
    status: string;
    createdAt: Date;
    lastMessage: MessageDTO | null;
}

export type QuickReplySummary = {
    id: string;
    label: string;
    message: string;
};

export interface ScheduledBotMessagePayload {
    chatId: string;
    propertyId: string;
    companyId: string;
    text: string;
    section?: string;
    visitorMessageTimestamp: string;
    scheduledAt: string;
};

export type ChatSocketContext = {
    id: string;
    propertyId: string;
    sessionId: string;
    agentId: string | null;
};
