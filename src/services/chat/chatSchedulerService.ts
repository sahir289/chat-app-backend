import { SCHEDULED_BOT_DELAY_MS, SCHEDULED_BOT_ITEM_KEY_PREFIX, SCHEDULED_BOT_ITEM_TTL_SECONDS, SCHEDULED_BOT_LOCK_KEY_PREFIX, SCHEDULED_BOT_LOCK_TTL_SECONDS, SCHEDULED_BOT_WORKER_POLL_MS, SCHEDULED_BOT_ZSET_KEY } from "../../constants/chatConstant";
import prisma from "../../lib/prisma";
import { chatRepository } from "../../repositories/chatRepository";
import { ScheduledBotMessagePayload } from "../../types/chat";
import { getRedisClient, isRedisAvailable } from "../../utils/redis";
import { conversationRoutingService } from "../conversationRoutingService";
import { chatAutoReplyService } from "./chatAutoReplyService";
import { chatSocketService } from "./chatSocketService";
const fallbackScheduledBotMessages = new Map<string, { timeout: NodeJS.Timeout }>();
let scheduledBotWorkerTimer: NodeJS.Timeout | null = null;
let scheduledBotWorkerRunning = false;

function getScheduledBotItemKey(chatId: string): string {
    return `${SCHEDULED_BOT_ITEM_KEY_PREFIX}${chatId}`;
}

function getScheduledBotLockKey(chatId: string): string {
    return `${SCHEDULED_BOT_LOCK_KEY_PREFIX}${chatId}`;
}

async function processScheduledBotMessage(payload: ScheduledBotMessagePayload): Promise<void> {
    const timestamp = new Date(payload.visitorMessageTimestamp);

    const chat = await chatRepository.findById(payload.chatId);
    if (!chat || chat.agentId) {
        return;
    }

    const routingDecision = await conversationRoutingService.decideHandler({
        propertyId: payload.propertyId,
        companyId: payload.companyId,
        chatId: payload.chatId,
    });

    const hasAgentMessage = await prisma.message.findFirst({
        where: {
            chatId: payload.chatId,
            senderType: "AGENT",
            createdAt: {
                gte: timestamp,
            },
            deletedAt: null,
            isDeleted: false,
        } as any,
    });

    if (routingDecision.handler !== "agent" && !hasAgentMessage) {
        const botMsg = await chatAutoReplyService.sendAutoMessage(
            payload.chatId,
            payload.propertyId,
            payload.companyId,
            payload.text,
            payload.section
        );
        if (botMsg) {
            const chatRow = await chatRepository.findById(payload.chatId);
            if (chatRow) {
                await chatSocketService.broadcastBotMessage(
                    botMsg,
                    {
                        id: chatRow.id,
                        propertyId: chatRow.propertyId,
                        sessionId: chatRow.sessionId,
                        agentId: chatRow.agentId,
                    },
                    "[chatSchedulerService.processScheduledBotMessage]"
                );
            }
        }
    } else {
    }
}

async function runScheduledBotWorker(): Promise<void> {
    if (scheduledBotWorkerRunning) return;
    scheduledBotWorkerRunning = true;

    try {
        const redisAvailable = await isRedisAvailable();
        if (!redisAvailable) return;

        const redis = getRedisClient();
        const now = Date.now();

        const dueChatIds = await redis.zrangebyscore(
            SCHEDULED_BOT_ZSET_KEY,
            0,
            now,
            "LIMIT",
            0,
            50
        );

        for (const chatId of dueChatIds) {
            const itemKey = getScheduledBotItemKey(chatId);
            const lockKey = getScheduledBotLockKey(chatId);

            const lockAcquired = await redis.set(
                lockKey,
                `${process.pid}:${Date.now()}`,
                "EX",
                SCHEDULED_BOT_LOCK_TTL_SECONDS,
                "NX"
            );

            if (!lockAcquired) {
                continue;
            }

            try {
                const rawPayload = await redis.get(itemKey);
                if (!rawPayload) {
                    continue;
                }

                const payload = JSON.parse(rawPayload) as ScheduledBotMessagePayload;
                if (!payload.chatId || payload.chatId !== chatId) {
                    continue;
                }

                await processScheduledBotMessage(payload);
            } catch (error) {
            } finally {
                await Promise.allSettled([
                    redis.zrem(SCHEDULED_BOT_ZSET_KEY, chatId),
                    redis.del(itemKey, lockKey),
                ]);
            }
        }
    } catch (error) {
    } finally {
        scheduledBotWorkerRunning = false;
    }
}

function ensureScheduledBotWorkerStarted(): void {
    if (scheduledBotWorkerTimer) return;

    scheduledBotWorkerTimer = setInterval(() => {
        void runScheduledBotWorker();
    }, SCHEDULED_BOT_WORKER_POLL_MS);

    scheduledBotWorkerTimer.unref?.();
}

export const chatSchedulerService = {
    async cancelScheduledBotMessage(chatId: string): Promise<void> {
        const scheduled = fallbackScheduledBotMessages.get(chatId);
        if (scheduled) {
            clearTimeout(scheduled.timeout);
            fallbackScheduledBotMessages.delete(chatId);
        }

        const redisAvailable = await isRedisAvailable();
        if (redisAvailable) {
            try {
                const redis = getRedisClient();
                const itemKey = getScheduledBotItemKey(chatId);
                const lockKey = getScheduledBotLockKey(chatId);
                const legacyKey = `scheduled:bot:${chatId}`;

                await Promise.all([
                    redis.zrem(SCHEDULED_BOT_ZSET_KEY, chatId),
                    redis.del(itemKey, lockKey, legacyKey),
                ]);
            } catch (error) {
            }
        }
    },

    async scheduleDelayedBotMessage(
        chatId: string,
        propertyId: string,
        companyId: string,
        text: string,
        section?: string,
        visitorMessageTimestamp?: Date
    ): Promise<void> {
        await chatSchedulerService.cancelScheduledBotMessage(chatId);

        const timestamp = visitorMessageTimestamp || new Date();
        const payload: ScheduledBotMessagePayload = {
            chatId,
            propertyId,
            companyId,
            text,
            section,
            visitorMessageTimestamp: timestamp.toISOString(),
            scheduledAt: new Date().toISOString(),
        };

        const redisAvailable = await isRedisAvailable();
        if (redisAvailable) {
            try {
                const redis = getRedisClient();
                const runAtMs = Date.now() + SCHEDULED_BOT_DELAY_MS;
                const itemKey = getScheduledBotItemKey(chatId);

                await Promise.all([
                    redis.set(itemKey, JSON.stringify(payload), "EX", SCHEDULED_BOT_ITEM_TTL_SECONDS),
                    redis.zadd(SCHEDULED_BOT_ZSET_KEY, runAtMs, chatId),
                ]);

                ensureScheduledBotWorkerStarted();
                return;
            } catch (error) {
            }
        }

        const timeout = setTimeout(async () => {
            try {
                await processScheduledBotMessage(payload);
            } catch (err) {
            } finally {
                fallbackScheduledBotMessages.delete(chatId);
            }
        }, SCHEDULED_BOT_DELAY_MS);

        fallbackScheduledBotMessages.set(chatId, { timeout });
    },
};

export function startScheduledBotWorker(): void {
    ensureScheduledBotWorkerStarted();
}
