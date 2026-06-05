import type { Server as HTTPServer } from "node:http";
import { Server as IOServer, type Socket } from "socket.io";
import { config, isOriginAllowed } from "../config";
import { SOCKET_EVENTS } from "./events";
import { getModuleLogger } from "../utils/logger";
import { verifyAccessToken } from "../utils/token";
import { userRepository } from "../repositories/userRepository";
import {
    closeRedisSocketAdapter,
    ensureRedisAdapterConfigured,
    isRedisAdapterConfigured,
} from "../helpers/socket/socketRedisAdapter";

const log = getModuleLogger("socket");
import {
    handleChatJoin,
    handleChatLeave,
    handleMessage,
    handleTyping,
    handleChatClose,
    handleAgentAssign,
    handleMessageEdit,
} from "./handlers";
import type { JoinPayload, MessagePayload } from "./types";
import { cleanupSocket, refreshSocketPresence } from "./roomManager";
import { getCompanyRoom, getSuperAdminRoom } from "./helpers";

let io: IOServer | null = null;
let adapterRetryTimer: NodeJS.Timeout | null = null;

type SocketAuthUser = {
    id: string;
    companyId: string | null;
    role: string;
    isOwner: boolean;
    isSuperAdmin: boolean;
};

declare module "socket.io" {
    interface SocketData {
        authUser?: SocketAuthUser | null;
    }
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
    if (!cookieHeader) return {};
    const out: Record<string, string> = {};
    for (const part of cookieHeader.split(";")) {
        const [rawKey, ...rest] = part.trim().split("=");
        if (!rawKey) continue;
        const key = rawKey;
        const value = rest.join("=");
        if (!value) continue;
        try {
            out[key] = decodeURIComponent(value);
        } catch {
            out[key] = value;
        }
    }
    return out;
}

async function tryConfigureRedisAdapter(socketServer: IOServer): Promise<void> {
    await ensureRedisAdapterConfigured(socketServer, log);
    if (isRedisAdapterConfigured() && adapterRetryTimer) {
        clearInterval(adapterRetryTimer);
        adapterRetryTimer = null;
    }
}

function validateOrigin(origin: string | undefined, callback: (err: Error | null, allow: boolean) => void): void {
    if (isOriginAllowed(origin)) {
        callback(null, true);
        return;
    }

    // Log blocked origin
    log.warn(
        `[Socket.io CORS] Blocked origin: ${origin || "undefined"}. Allowed origins: ${config.cors.origins.join(", ") || "none (CORS_ORIGINS not set)"}`
    );

    callback(new Error("Not allowed by CORS"), false);
}

export function initSocket(server: HTTPServer): IOServer {
    io = new IOServer(server, {
        cors: {
            origin: validateOrigin,
            methods: [...config.socket.cors.methods],
            credentials: config.socket.cors.credentials,
            allowedHeaders: [...(config.socket.cors.allowedHeaders || ["Content-Type", "Authorization", "X-Requested-With"])],
        },
    });

    // Socket auth: best-effort parse of the same access token used for HTTP.
    // Visitors may connect without auth; agent/dashboard actions must verify auth in handlers.
    io.use(async (socket, next) => {
        try {
            const cookieHeader = socket.handshake.headers?.cookie;
            const cookies = parseCookies(cookieHeader);
            const tokenFromCookie = cookies.accessToken;

            const tokenFromAuth =
                typeof socket.handshake.auth?.token === "string"
                    ? socket.handshake.auth.token
                    : undefined;

            const token =
                tokenFromCookie ||
                (typeof socket.handshake.headers?.authorization === "string" &&
                socket.handshake.headers.authorization.startsWith("Bearer ")
                    ? socket.handshake.headers.authorization.split(" ")[1]
                    : undefined) ||
                tokenFromAuth;

            if (!token) {
                socket.data.authUser = null;
                return next();
            }

            const payload = verifyAccessToken<any>(token);
            const userId = payload?.userId;
            if (!userId) {
                socket.data.authUser = null;
                return next();
            }

            const dbUser = await userRepository.findById(userId);
            if (!dbUser || !dbUser.isActive || dbUser.deletedAt !== null) {
                socket.data.authUser = null;
                return next();
            }

            const isSuperAdmin =
                dbUser.role === ("SUPER_ADMIN" as any) || dbUser.isSuperAdmin === true;
            const tokenCompanyId = payload?.companyId ?? null;
            const userCompanyId = dbUser.companyId ?? null;

            // Mirror HTTP stale-claim protection.
            if (!isSuperAdmin && tokenCompanyId !== userCompanyId) {
                socket.data.authUser = null;
                return next();
            }
            if (isSuperAdmin && tokenCompanyId !== null) {
                socket.data.authUser = null;
                return next();
            }

            socket.data.authUser = {
                id: dbUser.id,
                companyId: dbUser.companyId ?? null,
                role: String(dbUser.role),
                isOwner: Boolean(dbUser.isOwner),
                isSuperAdmin,
            };
            return next();
        } catch {
            socket.data.authUser = null;
            return next();
        }
    });

    void tryConfigureRedisAdapter(io);
    if (!adapterRetryTimer) {
        adapterRetryTimer = setInterval(() => {
            if (!io || isRedisAdapterConfigured()) return;
            void tryConfigureRedisAdapter(io);
        }, 30_000);
        adapterRetryTimer.unref?.();
    }

    io.on("connection", (socket: Socket) => {
        log.info("[socket] Connected:", { socketId: socket.id });

        // Lets dashboards confirm the handshake carried a valid session (cookie + token).
        socket.emit("connection:auth", {
            authenticated: Boolean(socket.data.authUser?.id),
            companyId: socket.data.authUser?.companyId ?? null,
        });

        if (socket.data.authUser?.isSuperAdmin) {
            void socket.join(getSuperAdminRoom());
        } else if (socket.data.authUser?.companyId) {
            void socket.join(getCompanyRoom(socket.data.authUser.companyId));
        }

        const presenceHeartbeat = setInterval(() => {
            void refreshSocketPresence(socket.id);
        }, 30_000);
        presenceHeartbeat.unref?.();

        socket.on(SOCKET_EVENTS.VISITOR_CONNECT, async (payload: JoinPayload) => {
            socket.emit(SOCKET_EVENTS.CHAT_JOIN, { ...payload, role: "visitor" });
        });

        socket.on(SOCKET_EVENTS.AGENT_CONNECT, async (payload: JoinPayload) => {
            socket.emit(SOCKET_EVENTS.CHAT_JOIN, { ...payload, role: "agent" });
        });

        socket.on(SOCKET_EVENTS.CHAT_JOIN, async (payload: JoinPayload) => {
            await handleChatJoin(socket, payload, io);
        });

        socket.on(SOCKET_EVENTS.CHAT_LEAVE, async (payload: { chatId?: string }) => {
            await handleChatLeave(socket, payload, io);
        });

        socket.on(
            SOCKET_EVENTS.CHAT_MESSAGE,
            async (
                payload: MessagePayload,
                ack?: (resp: { ok: true; data: any } | { ok: false; error: string; code?: string }) => void
            ) => {
                const response = await handleMessage(socket, payload, io);
                ack?.(response);
            }
        );

        socket.on(SOCKET_EVENTS.VISITOR_TYPING, (payload: { chatId?: string; isTyping: boolean }) => {
            handleTyping(socket, payload, io);
        });

        socket.on(SOCKET_EVENTS.AGENT_TYPING, (payload: { chatId?: string; isTyping: boolean }) => {
            handleTyping(socket, payload, io);
        });

        socket.on(SOCKET_EVENTS.CHAT_TYPING, (payload: { chatId?: string; isTyping: boolean }) => {
            handleTyping(socket, payload, io);
        });

        socket.on(
            SOCKET_EVENTS.VISITOR_SEND_MESSAGE,
            async (
                payload: MessagePayload,
                ack?: (resp: { ok: true; data: any } | { ok: false; error: string; code?: string }) => void
            ) => {
                const response = await handleMessage(socket, payload, io, {
                    defaultSenderType: "VISITOR",
                });
                ack?.(response);
            }
        );

        socket.on(
            SOCKET_EVENTS.AGENT_SEND_MESSAGE,
            async (
                payload: MessagePayload,
                ack?: (resp: { ok: true; data: any } | { ok: false; error: string; code?: string }) => void
            ) => {
                const response = await handleMessage(socket, payload, io, {
                    requiredRole: "agent",
                    defaultSenderType: "AGENT",
                });
                ack?.(response);
            }
        );

        socket.on(SOCKET_EVENTS.VISITOR_END_CHAT, (payload: { chatId: string }) => {
            socket.emit(SOCKET_EVENTS.CHAT_CLOSE, payload);
        });

        socket.on(SOCKET_EVENTS.AGENT_JOIN_CHAT, (payload: { chatId: string }) => {
            socket.emit(SOCKET_EVENTS.CHAT_JOIN, { ...payload, role: "agent" });
        });

        socket.on(
            SOCKET_EVENTS.AGENT_ASSIGN_CHAT,
            async (
                payload: { chatId: string; agentId: string | null },
                ack?: (resp: { ok: true } | { ok: false; error: string; code?: string }) => void
            ) => {
                await handleAgentAssign(socket, payload, io, ack);
            }
        );

        socket.on(SOCKET_EVENTS.CHAT_CLOSE, async (payload: { chatId?: string }) => {
            await handleChatClose(socket, payload, io);
        });

        socket.on(
            SOCKET_EVENTS.MESSAGE_EDIT,
            async (
                payload: { messageId: string; text: string },
                ack?: (
                    resp:
                        | { ok: true; data: { id: string; chatId: string; text: string; editedAt?: string } }
                        | { ok: false; error: string; code?: string }
                ) => void
            ) => {
                const response = await handleMessageEdit(socket, payload, io);
                ack?.(response);
            }
        );

        socket.on("disconnect", async () => {
            clearInterval(presenceHeartbeat);
            await cleanupSocket(socket.id, io);
            log.info("[socket] Disconnected:", { socketId: socket.id });
        });
    });

    return io;
}

export function getIO(): IOServer {
    if (!io) {
        throw new Error("Socket.io not initialized");
    }
    return io;
}

export async function closeSocketAdapter(): Promise<void> {
    if (adapterRetryTimer) {
        clearInterval(adapterRetryTimer);
        adapterRetryTimer = null;
    }

    await closeRedisSocketAdapter();
}

export { isVisitorOnline, hasOnlineAgents, getOnlineChatIds, isChatActivelyViewedByAgent } from "./roomManager";
export { SOCKET_EVENTS } from "./events";
export { getChatRoom, getPropertyRoom, broadcastMessage } from "./helpers";
export type { JoinPayload, MessagePayload, SocketRoom } from "./types";

