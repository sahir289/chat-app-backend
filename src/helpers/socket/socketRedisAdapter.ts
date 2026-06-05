import { createAdapter } from "@socket.io/redis-adapter";
import type Redis from "ioredis";
import type { Server as IOServer } from "socket.io";
import { getRedisClient } from "../../utils/redis";

interface SocketLogger {
    info: (message: string, ...meta: unknown[]) => void;
    warn: (message: string, ...meta: unknown[]) => void;
}

let adapterPubClient: Redis | null = null;
let adapterSubClient: Redis | null = null;
let adapterConfigured = false;
let adapterSetupPromise: Promise<void> | null = null;

export function isRedisAdapterConfigured(): boolean {
    return adapterConfigured;
}

async function configureRedisAdapter(socketServer: IOServer, logger: SocketLogger): Promise<void> {
    const baseClient = getRedisClient();
    const nextPubClient = baseClient.duplicate({
        lazyConnect: true,
        maxRetriesPerRequest: null,
    });
    const nextSubClient = baseClient.duplicate({
        lazyConnect: true,
        maxRetriesPerRequest: null,
    });

    try {
        await Promise.all([
            nextPubClient.connect(),
            nextSubClient.connect(),
        ]);

        socketServer.adapter(createAdapter(nextPubClient, nextSubClient));
        adapterPubClient = nextPubClient;
        adapterSubClient = nextSubClient;
        adapterConfigured = true;
        logger.info("[socket] Redis adapter enabled");
    } catch (error) {
        adapterConfigured = false;
        logger.warn("[socket] Failed to enable Redis adapter. Falling back to in-memory adapter:", error);
        await Promise.allSettled([
            nextPubClient.quit(),
            nextSubClient.quit(),
        ]);
        await closeRedisSocketAdapter();
    }
}

export async function ensureRedisAdapterConfigured(
    socketServer: IOServer,
    logger: SocketLogger
): Promise<void> {
    if (adapterConfigured) {
        return;
    }

    if (adapterSetupPromise) {
        await adapterSetupPromise;
        return;
    }

    adapterSetupPromise = configureRedisAdapter(socketServer, logger)
        .finally(() => {
            adapterSetupPromise = null;
        });

    await adapterSetupPromise;
}

export async function closeRedisSocketAdapter(): Promise<void> {
    const clients = [adapterPubClient, adapterSubClient].filter(Boolean) as Redis[];
    await Promise.allSettled(clients.map((client) => client.quit()));

    adapterPubClient = null;
    adapterSubClient = null;
    adapterConfigured = false;
}
