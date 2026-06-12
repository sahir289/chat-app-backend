import type { Socket, Server as IOServer } from "socket.io";
import { getChatRoom, getCompanyRoom, getPropertyRoom, getSessionRoom, getSuperAdminRoom } from "./helpers";
import { SOCKET_EVENTS } from "./events";
import type { SocketRoom } from "./types";
import { getRedisClient, isRedisAvailable } from "../utils/redis";
import { getModuleLogger } from "../utils/logger";

const log = getModuleLogger("roomManager");

// Fallback in-memory stores for when Redis is unavailable
const fallbackSocketRooms = new Map<string, SocketRoom>();
const fallbackOnlineVisitors = new Map<string, Set<string>>();
const fallbackOnlineAgents = new Map<string, Set<string>>();
const fallbackTypingUsers = new Map<string, Set<string>>();

const SOCKET_ROOM_TTL_SECONDS = 60 * 60; // 1 hour
const PRESENCE_TTL_SECONDS = 60 * 60; // 1 hour
const TYPING_TTL_SECONDS = 5 * 60; // 5 minutes
const ONLINE_CHATS_SET_KEY = "online:chats";

export async function joinChatRoom(
    socket: Socket,
    chatId: string | undefined,
    propertyId: string,
    role: SocketRoom["role"],
    sessionId?: string,
    companyId?: string,
    agentId?: string | null
): Promise<void> {
    // CRITICAL: Visitors should NEVER join propertyRoom
    // Only agents and dashboard should join propertyRoom
    if (role === "visitor") {
        if (chatId) {
            // Visitors with a chat join their specific chat room - complete isolation
            const chatRoom = getChatRoom(chatId);
            await socket.join(chatRoom);
        } else {
            // Visitors without a chat yet join a session-based room
            const sessionRoom = getSessionRoom(sessionId || "", propertyId);
            await socket.join(sessionRoom);
        }
    } else {
        // Agents and dashboard join both chat room and property room
        if (chatId) {
            const chatRoom = getChatRoom(chatId);
            const propertyRoom = getPropertyRoom(propertyId);
            await Promise.all([
                socket.join(chatRoom),
                socket.join(propertyRoom),
            ]);
        } else {
            // Agent/dashboard without chatId just join property room
            const propertyRoom = getPropertyRoom(propertyId);
            await socket.join(propertyRoom);
        }
    }

    await setSocketRoom(socket.id, {
        chatId,
        propertyId,
        sessionId,
        role,
        companyId,
        agentId: agentId ?? null,
    });
}

export async function joinPropertyRoom(
    socket: Socket,
    propertyId: string,
    role: SocketRoom["role"],
    companyId?: string,
    chatId?: string,
    agentId?: string | null
): Promise<void> {
    const propertyRoom = getPropertyRoom(propertyId);
    await socket.join(propertyRoom);

    await setSocketRoom(socket.id, {
        chatId,
        propertyId,
        sessionId: "",
        role,
        companyId,
        agentId: agentId ?? null,
    });
}

// Helper functions for socket room management
async function setSocketRoom(socketId: string, room: SocketRoom): Promise<void> {
    const redisAvailable = await isRedisAvailable();

    if (redisAvailable) {
        try {
            const redis = getRedisClient();
            const key = `socket:room:${socketId}`;
            await redis.setex(key, SOCKET_ROOM_TTL_SECONDS, JSON.stringify(room));
            return;
        } catch (error) {
            log.warn("Redis error in setSocketRoom, falling back to memory:", error);
        }
    }

    fallbackSocketRooms.set(socketId, room);
}

async function getSocketRoomData(socketId: string): Promise<SocketRoom | undefined> {
    const redisAvailable = await isRedisAvailable();

    if (redisAvailable) {
        try {
            const redis = getRedisClient();
            const key = `socket:room:${socketId}`;
            const data = await redis.get(key);
            return data ? JSON.parse(data) : undefined;
        } catch (error) {
            log.warn("Redis error in getSocketRoomData, falling back to memory:", error);
        }
    }

    return fallbackSocketRooms.get(socketId);
}

async function deleteSocketRoom(socketId: string): Promise<void> {
    const redisAvailable = await isRedisAvailable();

    if (redisAvailable) {
        try {
            const redis = getRedisClient();
            const key = `socket:room:${socketId}`;
            await redis.del(key);
            return;
        } catch (error) {
            log.warn("Redis error in deleteSocketRoom, falling back to memory:", error);
        }
    }

    fallbackSocketRooms.delete(socketId);
}

export async function addOnlineVisitor(chatId: string, socketId: string): Promise<void> {
    const redisAvailable = await isRedisAvailable();

    if (redisAvailable) {
        try {
            const redis = getRedisClient();
            const key = `visitors:${chatId}`;
            await redis.sadd(key, socketId);
            await redis.expire(key, PRESENCE_TTL_SECONDS);
            await redis.sadd(ONLINE_CHATS_SET_KEY, chatId);
            return;
        } catch (error) {
            log.warn("Redis error in addOnlineVisitor, falling back to memory:", error);
        }
    }

    if (!fallbackOnlineVisitors.has(chatId)) {
        fallbackOnlineVisitors.set(chatId, new Set());
    }
    fallbackOnlineVisitors.get(chatId)?.add(socketId);
}

export async function removeOnlineVisitor(chatId: string, socketId: string): Promise<boolean> {
    const redisAvailable = await isRedisAvailable();

    if (redisAvailable) {
        try {
            const redis = getRedisClient();
            const key = `visitors:${chatId}`;
            await redis.srem(key, socketId);
            const count = await redis.scard(key);
            if (count === 0) {
                await Promise.all([
                    redis.del(key),
                    redis.srem(ONLINE_CHATS_SET_KEY, chatId),
                ]);
            }
            return count === 0;
        } catch (error) {
            log.warn("Redis error in removeOnlineVisitor, falling back to memory:", error);
        }
    }

    const visitorSockets = fallbackOnlineVisitors.get(chatId);
    visitorSockets?.delete(socketId);

    if (!visitorSockets || visitorSockets.size === 0) {
        fallbackOnlineVisitors.delete(chatId);
        return true;
    }
    return false;
}

export async function addOnlineAgent(propertyId: string, socketId: string): Promise<void> {
    const redisAvailable = await isRedisAvailable();

    if (redisAvailable) {
        try {
            const redis = getRedisClient();
            const key = `agents:${propertyId}`;
            await redis.sadd(key, socketId);
            await redis.expire(key, PRESENCE_TTL_SECONDS);
            return;
        } catch (error) {
            log.warn("Redis error in addOnlineAgent, falling back to memory:", error);
        }
    }

    if (!fallbackOnlineAgents.has(propertyId)) {
        fallbackOnlineAgents.set(propertyId, new Set());
    }
    fallbackOnlineAgents.get(propertyId)?.add(socketId);
}

export async function removeOnlineAgent(propertyId: string, socketId: string): Promise<boolean> {
    const redisAvailable = await isRedisAvailable();

    if (redisAvailable) {
        try {
            const redis = getRedisClient();
            const key = `agents:${propertyId}`;
            await redis.srem(key, socketId);
            const count = await redis.scard(key);
            return count === 0;
        } catch (error) {
            log.warn("Redis error in removeOnlineAgent, falling back to memory:", error);
        }
    }

    const agentSockets = fallbackOnlineAgents.get(propertyId);
    agentSockets?.delete(socketId);

    if (!agentSockets || agentSockets.size === 0) {
        fallbackOnlineAgents.delete(propertyId);
        return true;
    }
    return false;
}

export function broadcastAgentAvailability(
    io: IOServer | null,
    propertyId: string,
    available: boolean
): void {
    if (!io) return;
    io.to(getPropertyRoom(propertyId)).emit(SOCKET_EVENTS.AGENT_AVAILABILITY, {
        propertyId,
        available,
    });
}

export function broadcastVisitorStatus(
    io: IOServer | null,
    propertyId: string,
    chatId: string,
    status: "online" | "offline"
): void {
    if (!io) return;
    io.to(getPropertyRoom(propertyId)).emit(SOCKET_EVENTS.VISITOR_STATUS, {
        chatId,
        status,
    });
}

export async function addTypingUser(chatId: string, socketId: string): Promise<void> {
    const redisAvailable = await isRedisAvailable();

    if (redisAvailable) {
        try {
            const redis = getRedisClient();
            const key = `typing:${chatId}`;
            await redis.sadd(key, socketId);
            await redis.expire(key, TYPING_TTL_SECONDS);
            return;
        } catch (error) {
            log.warn("Redis error in addTypingUser, falling back to memory:", error);
        }
    }

    if (!fallbackTypingUsers.has(chatId)) {
        fallbackTypingUsers.set(chatId, new Set());
    }
    fallbackTypingUsers.get(chatId)?.add(socketId);
}

export async function removeTypingUser(chatId: string, socketId: string): Promise<void> {
    const redisAvailable = await isRedisAvailable();

    if (redisAvailable) {
        try {
            const redis = getRedisClient();
            const key = `typing:${chatId}`;
            await redis.srem(key, socketId);
            const count = await redis.scard(key);
            if (count === 0) {
                await redis.del(key);
            }
            return;
        } catch (error) {
            log.warn("Redis error in removeTypingUser, falling back to memory:", error);
        }
    }

    fallbackTypingUsers.get(chatId)?.delete(socketId);
    if (fallbackTypingUsers.get(chatId)?.size === 0) {
        fallbackTypingUsers.delete(chatId);
    }
}

export async function addTypingState(chatId: string, socketId: string): Promise<void> {
    await addTypingUser(chatId, socketId);
}

export async function removeTypingState(chatId: string, socketId: string): Promise<void> {
    await removeTypingUser(chatId, socketId);
}

export async function handleTypingState(chatId: string, socketId: string, isTyping: boolean): Promise<void> {
    if (isTyping) {
        await addTypingState(chatId, socketId);
    } else {
        await removeTypingState(chatId, socketId);
    }
}

export async function cleanupSocket(socketId: string, io: IOServer | null): Promise<void> {
    const roomInfo = await getSocketRoomData(socketId);
    if (!roomInfo) return;

    if (roomInfo.chatId) {
        await removeTypingState(roomInfo.chatId, socketId);
    }

    if (roomInfo.role === "visitor") {
        // Always remove visitor from online set when they disconnect
        if (roomInfo.chatId) {
            const noMoreVisitors = await removeOnlineVisitor(roomInfo.chatId, socketId);
            // Broadcast offline status when no more visitors are online for this chat
            // This ensures the dashboard accurately reflects visitor connection state
            if (noMoreVisitors && roomInfo.propertyId) {
                broadcastVisitorStatus(io, roomInfo.propertyId, roomInfo.chatId, "offline");
                log.info(`[roomManager] Visitor disconnected, no more visitors online for chat ${roomInfo.chatId}, broadcasting offline`);
            } else if (roomInfo.propertyId) {
                // Even if other visitors exist, log the disconnect for debugging
                log.info(`[roomManager] Visitor disconnected from chat ${roomInfo.chatId}, but other visitors may still be online`);
            }
        } else if (roomInfo.propertyId) {
            // Visitor disconnected before creating a chat - log for debugging
            log.info(`[roomManager] Visitor disconnected before chat creation, sessionId: ${roomInfo.sessionId || 'unknown'}`);
        }
    }

    if ((roomInfo.role === "agent" || roomInfo.role === "dashboard") && roomInfo.propertyId) {
        const noMoreAgents = await removeOnlineAgent(roomInfo.propertyId, socketId);
        broadcastAgentAvailability(io, roomInfo.propertyId, !noMoreAgents);
    }

    await deleteSocketRoom(socketId);
}

export async function leaveChatRoom(
    socket: Socket,
    chatId: string
): Promise<void> {
    const chatRoom = getChatRoom(chatId);
    await socket.leave(chatRoom);

    // Update socket room info to remove chatId if it matches
    const roomInfo = await getSocketRoomData(socket.id);
    if (roomInfo && roomInfo.chatId === chatId) {
        // If agent/dashboard, keep property room but remove chat room
        if (roomInfo.role === "agent" || roomInfo.role === "dashboard") {
            // Update room info to remove chatId but keep propertyId
            await setSocketRoom(socket.id, {
                chatId: undefined,
                propertyId: roomInfo.propertyId,
                sessionId: roomInfo.sessionId || "",
                role: roomInfo.role,
                companyId: roomInfo.companyId,
            });
        } else {
            // For visitors, remove the room info entirely if leaving their chat
            await deleteSocketRoom(socket.id);
        }
    }

    // Remove typing state
    await removeTypingState(chatId, socket.id);
}

export async function getSocketRoom(socketId: string): Promise<SocketRoom | undefined> {
    return await getSocketRoomData(socketId);
}

export async function isChatActivelyViewedByAgent(
    chatId: string,
    io: IOServer | null
): Promise<boolean> {
    if (!io || !chatId) return false;

    const chatRoom = getChatRoom(chatId);
    let socketIds: string[] = [];

    try {
        const sockets = await io.in(chatRoom).fetchSockets();
        socketIds = sockets.map((socket) => socket.id);
    } catch {
        const roomSockets = io.sockets.adapter.rooms.get(chatRoom);
        socketIds = roomSockets ? Array.from(roomSockets) : [];
    }

    if (socketIds.length === 0) {
        return false;
    }

    const uniqueSocketIds = Array.from(new Set(socketIds));
    const socketRooms = await Promise.all(
        uniqueSocketIds.map((socketId) => getSocketRoomData(socketId))
    );

    return socketRooms.some(
        (roomInfo) =>
            roomInfo?.chatId === chatId &&
            (roomInfo.role === "agent" || roomInfo.role === "dashboard")
    );
}

export async function isVisitorOnline(chatId: string, io?: IOServer | null): Promise<boolean> {
    const redisAvailable = await isRedisAvailable();
    let socketIds: string[] = [];

    if (redisAvailable) {
        try {
            const redis = getRedisClient();
            const key = `visitors:${chatId}`;
            socketIds = await redis.smembers(key);
            
            // If no socket IDs found, visitor is offline
            if (socketIds.length === 0) {
                return false;
            }
        } catch (error) {
            log.warn("Redis error in isVisitorOnline, falling back to memory:", error);
        }
    }

    // Fallback to memory if Redis not available or failed
    if (socketIds.length === 0) {
        const visitorSockets = fallbackOnlineVisitors.get(chatId);
        if (!visitorSockets || visitorSockets.size === 0) {
            return false;
        }
        socketIds = Array.from(visitorSockets);
    }

    // If io server is provided, verify sockets are actually connected
    if (io && socketIds.length > 0) {
        // Check if any of the socket IDs are still connected
        const connectedSockets = socketIds.filter((socketId) => {
            try {
                const socket = io.sockets.sockets.get(socketId);
                return socket && socket.connected;
            } catch (error) {
                return false;
            }
        });

        // If no sockets are connected, clean up stale entries
        if (connectedSockets.length === 0) {
            log.info(`[roomManager] Found stale visitor entries for chat ${chatId}, cleaning up`);
            // Clean up stale entries
            if (redisAvailable) {
                try {
                    const redis = getRedisClient();
                    const key = `visitors:${chatId}`;
                    await redis.del(key);
                    await redis.srem(ONLINE_CHATS_SET_KEY, chatId);
                } catch (error) {
                    log.warn("Redis error cleaning up stale visitor entries:", error);
                }
            } else {
                fallbackOnlineVisitors.delete(chatId);
            }
            return false;
        }

        // If some sockets are stale, clean them up
        if (connectedSockets.length < socketIds.length) {
            const staleSockets = socketIds.filter((id) => !connectedSockets.includes(id));
            log.info(`[roomManager] Cleaning up ${staleSockets.length} stale visitor socket(s) for chat ${chatId}`);
            
            if (redisAvailable) {
                try {
                    const redis = getRedisClient();
                    const key = `visitors:${chatId}`;
                    if (staleSockets.length > 0) {
                        await redis.srem(key, ...staleSockets);
                    }
                    // Check if any visitors remain
                    const remaining = await redis.scard(key);
                    if (remaining === 0) {
                        await redis.del(key);
                        await redis.srem(ONLINE_CHATS_SET_KEY, chatId);
                    }
                } catch (error) {
                    log.warn("Redis error cleaning up stale visitor entries:", error);
                }
            } else {
                staleSockets.forEach((id) => {
                    fallbackOnlineVisitors.get(chatId)?.delete(id);
                });
                if (fallbackOnlineVisitors.get(chatId)?.size === 0) {
                    fallbackOnlineVisitors.delete(chatId);
                }
            }
        }

        return connectedSockets.length > 0;
    }

    // If io not provided, return based on socket IDs existence (legacy behavior)
    return socketIds.length > 0;
}

export async function hasOnlineAgents(propertyId: string): Promise<boolean> {
    const redisAvailable = await isRedisAvailable();

    if (redisAvailable) {
        try {
            const redis = getRedisClient();
            const key = `agents:${propertyId}`;
            const count = await redis.scard(key);
            return count > 0;
        } catch (error) {
            log.warn("Redis error in hasOnlineAgents, falling back to memory:", error);
        }
    }

    const agentSockets = fallbackOnlineAgents.get(propertyId);
    return !!(agentSockets && agentSockets.size > 0);
}

export async function getOnlineAgentIdsForProperty(propertyId: string): Promise<string[]> {
    let socketIds: string[] = [];
    const redisAvailable = await isRedisAvailable();

    if (redisAvailable) {
        try {
            const redis = getRedisClient();
            socketIds = await redis.smembers(`agents:${propertyId}`);
        } catch (error) {
            log.warn("Redis error in getOnlineAgentIdsForProperty, falling back to memory:", error);
        }
    }

    if (socketIds.length === 0) {
        socketIds = Array.from(fallbackOnlineAgents.get(propertyId) ?? []);
    }

    if (socketIds.length === 0) {
        return [];
    }

    const agentIds = new Set<string>();
    await Promise.all(
        socketIds.map(async (socketId) => {
            const roomInfo = await getSocketRoomData(socketId);
            if (
                roomInfo?.propertyId === propertyId &&
                (roomInfo.role === "agent" || roomInfo.role === "dashboard") &&
                roomInfo.agentId
            ) {
                agentIds.add(roomInfo.agentId);
            }
        })
    );

    return Array.from(agentIds);
}

export async function getOnlineChatIds(): Promise<string[]> {
    const redisAvailable = await isRedisAvailable();

    if (redisAvailable) {
        try {
            const redis = getRedisClient();
            const candidateChatIds = await redis.smembers(ONLINE_CHATS_SET_KEY);
            if (candidateChatIds.length === 0) {
                return [];
            }

            const pipeline = redis.pipeline();
            for (const chatId of candidateChatIds) {
                pipeline.scard(`visitors:${chatId}`);
            }

            const counts = await pipeline.exec();
            const onlineChatIds: string[] = [];
            const staleChatIds: string[] = [];

            counts?.forEach((result, index) => {
                const [err, count] = result;
                const chatId = candidateChatIds[index];
                if (!chatId) return;

                if (err) {
                    staleChatIds.push(chatId);
                    return;
                }

                if (typeof count === "number" && count > 0) {
                    onlineChatIds.push(chatId);
                } else {
                    staleChatIds.push(chatId);
                }
            });

            if (staleChatIds.length > 0) {
                await redis.srem(ONLINE_CHATS_SET_KEY, ...staleChatIds);
            }

            return onlineChatIds;
        } catch (error) {
            log.warn("Redis error in getOnlineChatIds, falling back to memory:", error);
        }
    }

    return Array.from(fallbackOnlineVisitors.keys());
}

export async function refreshSocketPresence(socketId: string): Promise<void> {
    const roomInfo = await getSocketRoomData(socketId);
    if (!roomInfo) return;

    const redisAvailable = await isRedisAvailable();
    if (redisAvailable) {
        try {
            const redis = getRedisClient();
            const ops: Promise<unknown>[] = [
                redis.expire(`socket:room:${socketId}`, SOCKET_ROOM_TTL_SECONDS),
            ];

            if (roomInfo.role === "visitor" && roomInfo.chatId) {
                const visitorsKey = `visitors:${roomInfo.chatId}`;
                ops.push(
                    redis.sadd(visitorsKey, socketId),
                    redis.expire(visitorsKey, PRESENCE_TTL_SECONDS),
                    redis.sadd(ONLINE_CHATS_SET_KEY, roomInfo.chatId)
                );
            }

            if ((roomInfo.role === "agent" || roomInfo.role === "dashboard") && roomInfo.propertyId) {
                const agentsKey = `agents:${roomInfo.propertyId}`;
                ops.push(
                    redis.sadd(agentsKey, socketId),
                    redis.expire(agentsKey, PRESENCE_TTL_SECONDS)
                );
            }

            await Promise.all(ops);
            return;
        } catch (error) {
            log.warn("Redis error in refreshSocketPresence:", error);
        }
    }
}

export function broadcastCompanyProStatusUpdate(
    io: IOServer | null,
    companyId: string,
    isPro: boolean
): void {
    if (!io) return;
    const payload = {
        companyId,
        isPro,
    };
    io.to(getCompanyRoom(companyId)).emit(SOCKET_EVENTS.COMPANY_PRO_STATUS_UPDATED, payload);
    io.to(getSuperAdminRoom()).emit(SOCKET_EVENTS.COMPANY_PRO_STATUS_UPDATED, payload);
}

export function broadcastCompanyOpenAiModelsUpdate(
    io: IOServer | null,
    companyId: string,
    modelIds: string[]
): void {
    if (!io) return;
    const payload = {
        companyId,
        modelIds,
    };
    io.to(getCompanyRoom(companyId)).emit(SOCKET_EVENTS.COMPANY_OPENAI_MODELS_UPDATED, payload);
    io.to(getSuperAdminRoom()).emit(SOCKET_EVENTS.COMPANY_OPENAI_MODELS_UPDATED, payload);
}

export type UpgradeRequestBroadcastMeta = {
    eventKind?: "created" | "updated";
    companyName?: string;
    requesterName?: string;
};

export function broadcastUpgradeRequestUpdate(
    io: IOServer | null,
    companyId: string,
    requestId: string,
    status: string,
    meta?: UpgradeRequestBroadcastMeta
): void {
    if (!io) return;
    const payload = {
        companyId,
        requestId,
        status,
        eventKind: meta?.eventKind ?? "updated",
        ...(meta?.companyName != null ? { companyName: meta.companyName } : {}),
        ...(meta?.requesterName != null ? { requesterName: meta.requesterName } : {}),
    };
    io.to(getCompanyRoom(companyId)).emit(SOCKET_EVENTS.UPGRADE_REQUEST_UPDATED, payload);
    io.to(getSuperAdminRoom()).emit(SOCKET_EVENTS.UPGRADE_REQUEST_UPDATED, payload);
}

export function broadcastAiCreditsUpdate(io: IOServer | null, companyId: string): void {
    if (!io) return;
    const payload = { companyId };
    io.to(getCompanyRoom(companyId)).emit(SOCKET_EVENTS.AI_CREDITS_UPDATED, payload);
    io.to(getSuperAdminRoom()).emit(SOCKET_EVENTS.AI_CREDITS_UPDATED, payload);
}

