import { closeSocketAdapter } from "../socket/index";
import { closeRedis } from "../utils/redis";
import { getModuleLogger } from "../utils/logger";
import prisma from "./prisma";

const log = getModuleLogger("server");

export async function closeRuntimeResources(): Promise<void> {
  const cleanupTargets = [
    { name: "Socket adapter", close: () => closeSocketAdapter() },
    { name: "Redis connection", close: () => closeRedis() },
    { name: "Database connection", close: () => prisma.$disconnect() },
  ];

  const results = await Promise.allSettled(
    cleanupTargets.map((target) => target.close())
  );

  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    const name = cleanupTargets[index]?.name ?? `resource-${index}`;
    if (result?.status === "fulfilled") {
      log.info(`${name} closed`);
    } else {
      log.warn(`[index] Failed to close ${name.toLowerCase()}:`, result?.reason);
    }
  }
}
