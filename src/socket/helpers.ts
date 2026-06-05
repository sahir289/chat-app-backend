import type { Socket, Server as IOServer } from "socket.io";
import type { IncomingHttpHeaders } from "node:http";
import type { MessageDTO } from "../types/chat";
import { SOCKET_EVENTS } from "./events";
import type { MessagePayload, SocketError, ChatInfo, BroadcastMessageOptions } from "./types";
import { getModuleLogger } from "../utils/logger";
import { getLocationFromIP } from "../utils/ipLocation";

const log = getModuleLogger("socket");

export function getChatRoom(chatId: string): string {
    return `chat:${chatId}`;
}

export function getPropertyRoom(propertyId: string): string {
    return `property:${propertyId}`;
}

export function getCompanyRoom(companyId: string): string {
    return `company:${companyId}`;
}

export function getSuperAdminRoom(): string {
    return "super-admin";
}

export function getSessionRoom(sessionId: string, propertyId: string): string {
    return `session:${propertyId}:${sessionId}`;
}

export function emitError(socket: Socket, error: SocketError): void {
    socket.emit(SOCKET_EVENTS.CHAT_ERROR, error);
}

export function createError(message: string, code?: string, details?: unknown): SocketError {
    return { code, message, details };
}

export function transformMessageToPayload(
    message: MessageDTO,
    sessionId?: string,
    agentId?: string | null
): MessagePayload {
    return {
        id: message.id,
        chatId: String(message.chatId), // Ensure chatId is always a string
        senderType: message.senderType,
        text: message.text,
        createdAt: message.createdAt.toISOString(),
        sessionId,
        agentId,
        quickReplies: message.quickReplies,
        clientMessageId: message.clientMessageId ?? undefined,
        replyToClientMessageId: message.replyToClientMessageId ?? undefined,
        attachments: message.attachments?.map((att) => ({
            id: att.id,
            fileName: att.fileName,
            fileType: att.fileType,
            fileSize: att.fileSize,
            fileUrl: att.fileUrl,
            thumbnailUrl: att.thumbnailUrl,
        })),
    };
}

export function broadcastMessage(
    io: IOServer | null,
    message: MessageDTO,
    chat: ChatInfo | null,
    options?: BroadcastMessageOptions
): void {
    if (!io || !chat) return;

    const chatRoom = getChatRoom(chat.id);
    const propertyRoom = getPropertyRoom(chat.propertyId);
    const payload = transformMessageToPayload(message, chat.sessionId, chat.agentId);

    if (message.senderType === "VISITOR") {
        io.to(chatRoom).emit(SOCKET_EVENTS.VISITOR_MESSAGE, payload);
        if (options?.includePropertyRoom) {
            io.to(propertyRoom).emit(SOCKET_EVENTS.VISITOR_MESSAGE, payload);
        }
    } else if (message.senderType === "AGENT") {
        io.to(chatRoom).emit(SOCKET_EVENTS.AGENT_MESSAGE, payload);
    }

    if (options?.includeLegacyEvents !== false) {
        io.to(chatRoom).emit(SOCKET_EVENTS.CHAT_MESSAGE, payload);
        if (options?.includePropertyRoom && message.senderType === "VISITOR") {
            io.to(propertyRoom).emit(SOCKET_EVENTS.CHAT_MESSAGE, payload);
        }
    }

    if (options?.includePropertyRoom) {
        io.to(propertyRoom).emit(SOCKET_EVENTS.CHAT_UPDATED, { chatId: chat.id });
    }
}

export function normalizeIpAddress(
    ipAddress?: string | null,
    socketAddress?: string,
    headers?: IncomingHttpHeaders
): string | null {
    const headerIp = getForwardedIpFromHeaders(headers);
    const socketIp = normalizeIp(socketAddress);
    const explicitIp = normalizeIp(ipAddress);

    if (headerIp) {
        return headerIp;
    }

    if (socketIp && !isLoopbackOrPrivateIp(socketIp)) {
        return socketIp;
    }

    return explicitIp || socketIp || null;
}

export async function resolveVisitorLocation(
    ipAddress: string | null,
    country?: string | null
): Promise<string | null> {
    if (country) return country;
    if (!ipAddress) return null;

    try {
        const location = await getLocationFromIP(ipAddress);
        if (location.country) {
            const parts: string[] = [];
            if (location.city) parts.push(location.city);
            if (location.region && location.region !== location.city) {
                parts.push(location.region);
            }
            parts.push(location.country);
            return parts.join(", ");
        }
    } catch (err) {
        log.error("[socket] Failed to get location from IP:", err);
    }
    return null;
}

function normalizeIp(ip?: string | null): string | null {
    if (!ip) {
        return null;
    }

    let normalized = ip.startsWith("::ffff:") ? ip.replace("::ffff:", "") : ip;
    normalized = normalized.trim();
    if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(normalized)) {
        normalized = normalized.split(":")[0];
    }

    return normalized || null;
}

function getHeaderIp(value: string | string[] | undefined): string | null {
    if (!value) {
        return null;
    }

    const raw = Array.isArray(value) ? value[0] : value;
    const ips = raw
        .split(",")
        .map((part) => normalizeIp(part))
        .filter((ip): ip is string => Boolean(ip));

    if (ips.length === 0) {
        return null;
    }

    const firstPublicIp = ips.find((ip) => !isLoopbackOrPrivateIp(ip));
    return firstPublicIp ?? ips[0];
}

function getForwardedIpFromHeaders(headers?: IncomingHttpHeaders): string | null {
    if (!headers) {
        return null;
    }

    return (
        getHeaderIp(headers["cf-connecting-ip"]) ??
        getHeaderIp(headers["x-real-ip"]) ??
        getHeaderIp(headers["x-client-ip"]) ??
        getHeaderIp(headers["x-forwarded-for"])
    );
}

function isLoopbackOrPrivateIp(ip: string | null): boolean {
    if (!ip) {
        return false;
    }

    return (
        ip === "127.0.0.1" ||
        ip === "::1" ||
        ip.startsWith("10.") ||
        ip.startsWith("192.168.") ||
        ip.startsWith("172.16.") ||
        ip.startsWith("172.17.") ||
        ip.startsWith("172.18.") ||
        ip.startsWith("172.19.") ||
        ip.startsWith("172.20.") ||
        ip.startsWith("172.21.") ||
        ip.startsWith("172.22.") ||
        ip.startsWith("172.23.") ||
        ip.startsWith("172.24.") ||
        ip.startsWith("172.25.") ||
        ip.startsWith("172.26.") ||
        ip.startsWith("172.27.") ||
        ip.startsWith("172.28.") ||
        ip.startsWith("172.29.") ||
        ip.startsWith("172.30.") ||
        ip.startsWith("172.31.")
    );
}

export function emitVisitorUpdate(
    io: IOServer | null,
    propertyId: string,
    sessionId: string,
    lastSeen: Date
): void {
    if (!io) return;

    const propertyRoom = getPropertyRoom(propertyId);
    io.to(propertyRoom).emit(SOCKET_EVENTS.VISITOR_UPDATED, {
        sessionId,
        lastSeen: lastSeen.toISOString(),
    });
}

