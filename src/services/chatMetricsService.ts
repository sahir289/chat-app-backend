import { ChatStatus } from "@prisma/client";
import prisma from "../lib/prisma";
import { getOnlineChatIds } from "../socket/index";

function dateWhere(startDate?: Date, endDate?: Date) {
  if (!startDate && !endDate) return undefined;
  return {
    ...(startDate ? { gte: startDate } : {}),
    ...(endDate ? { lt: endDate } : {}),
  };
}

export type ChatBucketCounts = {
  totalChats: number;
  activeChats: number;
  closedChats: number;
  onlineActiveChats: number;
  activeChatIds: string[];
  closedChatIds: string[];
};

export async function getChatBucketCounts(params: {
  companyId: string;
  propertyId?: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<ChatBucketCounts> {
  const { companyId, propertyId, startDate, endDate } = params;
  const createdAtFilter = dateWhere(startDate, endDate);

  const [chats, onlineChatIdsRaw] = await Promise.all([
    prisma.chat.findMany({
      where: {
        companyId,
        deletedAt: null,
        ...(propertyId ? { propertyId } : {}),
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      },
      select: {
        id: true,
        status: true,
      },
    }),
    getOnlineChatIds(),
  ]);

  const onlineChatIds = new Set(onlineChatIdsRaw);
  const activeChatIds: string[] = [];
  const closedChatIds: string[] = [];
  let onlineActiveChats = 0;

  for (const chat of chats) {
    const isOnline = onlineChatIds.has(chat.id);
    const isActive =
      chat.status === ChatStatus.ACTIVE ||
      chat.status === ChatStatus.WAITING ||
      isOnline;

    if (isActive) {
      activeChatIds.push(chat.id);
      if (isOnline) {
        onlineActiveChats += 1;
      }
      continue;
    }

    closedChatIds.push(chat.id);
  }

  return {
    totalChats: chats.length,
    activeChats: activeChatIds.length,
    closedChats: closedChatIds.length,
    onlineActiveChats,
    activeChatIds,
    closedChatIds,
  };
}
