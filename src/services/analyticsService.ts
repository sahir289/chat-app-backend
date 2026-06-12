import { chatRepository } from "../repositories/chatRepository";
import { visitorEventRepository } from "../repositories/visitorEventRepository";
import prisma from "../lib/prisma";
import type { AgentStatus, RatingValue } from "@prisma/client";
import { getChatBucketCounts } from "./chatMetricsService";

function toWindow(startDate?: Date, endDate?: Date) {
  if (startDate || endDate) {
    return {
      start: startDate,
      end: endDate,
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { start: today, end: tomorrow };
}

function dateWhere(start?: Date, end?: Date) {
  if (!start && !end) return undefined;
  return {
    ...(start ? { gte: start } : {}),
    ...(end ? { lt: end } : {}),
  };
}

type AgentPerformanceItem = {
  agent: {
    id: string;
    name: string | null;
    email: string;
  };
  chats: number;
  activeChats: number;
  closedChats: number;
  messages: number;
  averageRating: number | null;
  totalRatings: number;
  currentChats: number;
  maxChats: number;
  utilizationPct: number | null;
  status: AgentStatus | null;
  lastSeen: Date | null;
};

function ratingToNumber(rating: RatingValue): number {
  const ratingValueMap: Record<RatingValue, number> = {
    POOR: 1,
    FAIR: 2,
    GOOD: 3,
    VERY_GOOD: 4,
    EXCELLENT: 5,
  };

  return ratingValueMap[rating] ?? 0;
}

async function getAgentPerformance(
  companyId: string,
  propertyId?: string,
  startDate?: Date,
  endDate?: Date
): Promise<AgentPerformanceItem[]> {
  const createdAtFilter = dateWhere(startDate, endDate);

  const chatWhere = {
    companyId,
    deletedAt: null,
    agentId: { not: null as string | null },
    ...(propertyId ? { propertyId } : {}),
    ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
  };

  const [chatGroups, messageGroups, ratingGroups] = await Promise.all([
    prisma.chat.groupBy({
      by: ["agentId", "status"],
      where: chatWhere,
      _count: { _all: true },
    }),
    prisma.message.groupBy({
      by: ["agentId"],
      where: {
        senderType: "AGENT",
        agentId: { not: null },
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
        chat: {
          companyId,
          deletedAt: null,
          ...(propertyId ? { propertyId } : {}),
        },
      },
      _count: { _all: true },
    }),
    prisma.chatRating.groupBy({
      by: ["agentId", "rating"],
      where: {
        agentId: { not: null },
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
        chat: {
          companyId,
          deletedAt: null,
          ...(propertyId ? { propertyId } : {}),
        },
      },
      _count: { _all: true },
    }),
  ]);

  const agentIds = new Set<string>();
  for (const group of chatGroups) {
    if (group.agentId) {
      agentIds.add(group.agentId);
    }
  }
  for (const group of messageGroups) {
    if (group.agentId) {
      agentIds.add(group.agentId);
    }
  }
  for (const group of ratingGroups) {
    if (group.agentId) {
      agentIds.add(group.agentId);
    }
  }

  if (agentIds.size === 0) {
    return [];
  }

  const users = await prisma.user.findMany({
    where: {
      id: { in: Array.from(agentIds) },
      companyId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      lastSeen: true,
      agentAvailability: {
        select: {
          status: true,
          currentChats: true,
          maxChats: true,
        },
      },
    },
  });

  const chatStats = new Map<
    string,
    { chats: number; activeChats: number; closedChats: number }
  >();

  for (const group of chatGroups) {
    if (!group.agentId) {
      continue;
    }
    const existing = chatStats.get(group.agentId) ?? {
      chats: 0,
      activeChats: 0,
      closedChats: 0,
    };
    existing.chats += group._count._all;
    if (group.status === "ACTIVE" || group.status === "WAITING") {
      existing.activeChats += group._count._all;
    }
    if (group.status === "CLOSED") {
      existing.closedChats += group._count._all;
    }
    chatStats.set(group.agentId, existing);
  }

  const messageStats = new Map<string, number>();
  for (const group of messageGroups) {
    if (!group.agentId) {
      continue;
    }
    messageStats.set(group.agentId, group._count._all);
  }

  const ratingStats = new Map<
    string,
    { totalRatings: number; weightedScore: number }
  >();
  for (const group of ratingGroups) {
    if (!group.agentId) {
      continue;
    }
    const existing = ratingStats.get(group.agentId) ?? {
      totalRatings: 0,
      weightedScore: 0,
    };
    existing.totalRatings += group._count._all;
    existing.weightedScore += ratingToNumber(group.rating) * group._count._all;
    ratingStats.set(group.agentId, existing);
  }

  return users
    .map((user) => {
      const chats = chatStats.get(user.id) ?? {
        chats: 0,
        activeChats: 0,
        closedChats: 0,
      };
      const ratings = ratingStats.get(user.id) ?? {
        totalRatings: 0,
        weightedScore: 0,
      };
      const currentChats = user.agentAvailability?.currentChats ?? 0;
      const maxChats = user.agentAvailability?.maxChats ?? 0;

      return {
        agent: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        chats: chats.chats,
        activeChats: chats.activeChats,
        closedChats: chats.closedChats,
        messages: messageStats.get(user.id) ?? 0,
        averageRating:
          ratings.totalRatings > 0
            ? Math.round((ratings.weightedScore / ratings.totalRatings) * 100) / 100
            : null,
        totalRatings: ratings.totalRatings,
        currentChats,
        maxChats,
        utilizationPct:
          maxChats > 0 ? Math.round((currentChats / maxChats) * 100) : null,
        status: user.agentAvailability?.status ?? null,
        lastSeen: user.lastSeen,
      };
    })
    .sort((a, b) => {
      if (b.chats !== a.chats) return b.chats - a.chats;
      if (b.messages !== a.messages) return b.messages - a.messages;
      if ((b.averageRating ?? 0) !== (a.averageRating ?? 0)) {
        return (b.averageRating ?? 0) - (a.averageRating ?? 0);
      }
      return a.agent.email.localeCompare(b.agent.email);
    });
}

export const analyticsService = {
  async getOverview(
    companyId: string,
    propertyId?: string,
    startDate?: Date,
    endDate?: Date
  ) {
    return this.getAnalytics(companyId, propertyId, startDate, endDate);
  },

  async getAnalytics(
    companyId: string,
    propertyId?: string,
    startDate?: Date,
    endDate?: Date
  ) {
    const window = toWindow(startDate, endDate);
    const createdAtFilter = dateWhere(window.start, window.end);
    const chatBuckets = await getChatBucketCounts({
      companyId,
      propertyId,
      startDate: window.start,
      endDate: window.end,
    });

    // Chats started in the requested window (defaults to "today" if no window provided).
    const totalChatsToday = propertyId
      ? await chatRepository.countByPropertyAndDateRange(companyId, propertyId, window.start, window.end)
      : await prisma.chat.count({
          where: {
            companyId,
            deletedAt: null,
            ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
          },
        });
    const activeChats = chatBuckets.activeChats;
    const closedChats = chatBuckets.closedChats;

    const avgResponseTime = propertyId
      ? await chatRepository.getAverageResponseTime(companyId, propertyId, window.start, window.end)
      : null;

    const pageViewsToday = propertyId
      ? await visitorEventRepository.countByPropertyAndType(companyId, propertyId, "page_view", window.start, window.end)
      : await prisma.visitorEvent.count({
          where: {
            companyId,
            eventType: "page_view",
            ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
          },
        });

    const totalLeads = await prisma.lead.count({
      where: {
        companyId,
        ...(propertyId ? { propertyId } : {}),
        property: { deletedAt: null },
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      },
    });

    const totalChats = await prisma.chat.count({
      where: {
        companyId,
        ...(propertyId ? { propertyId } : {}),
        deletedAt: null,
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      },
    });
    const conversionRate = totalChats > 0 ? (totalLeads / totalChats) * 100 : 0;

    // Get rating aggregations
    const ratingWhere: any = {
      chat: {
        companyId,
        deletedAt: null,
        ...(propertyId ? { propertyId } : {}),
      },
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
    };

    const ratings = await prisma.chatRating.findMany({
      where: ratingWhere,
      select: { rating: true },
    });

    const totalRatings = ratings.length;
    const averageRating = totalRatings
      ? ratings.reduce((acc, r) => acc + ratingToNumber(r.rating), 0) / totalRatings
      : 0;

    const ratingDistribution = this.toRatingDistribution(ratings.map((r) => r.rating));
    const agentPerformance = await getAgentPerformance(
      companyId,
      propertyId,
      window.start,
      window.end
    );

    return {
      totalChatsToday,
      totalChats,
      activeChats,
      closedChats,
      avgResponseTime,
      pageViewsToday,
      totalLeads,
      conversionRate: Math.round(conversionRate * 100) / 100,
      averageRating: Math.round(averageRating * 100) / 100,
      totalRatings,
      ratingDistribution,
      agentPerformance,
    };
  },


  async getConversionRate(
    companyId: string,
    propertyId?: string,
    startDate?: Date,
    endDate?: Date
  ) {
    const totalChats = await prisma.chat.count({
      where: {
        companyId,
        ...(propertyId ? { propertyId } : {}),
        deletedAt: null,
        ...(startDate || endDate
          ? {
            createdAt: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
          : {}),
      },
    });

    const totalLeads = await prisma.lead.count({
      where: {
        companyId,
        ...(propertyId ? { propertyId } : {}),
        property: { deletedAt: null },
        ...(startDate || endDate
          ? {
            createdAt: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
          : {}),
      },
    });

    return {
      totalChats,
      totalLeads,
      conversionRate: totalChats > 0 ? Math.round((totalLeads / totalChats) * 100 * 100) / 100 : 0,
    };
  },

  async getRatingDistribution(
    companyId: string,
    propertyId?: string
  ): Promise<Record<RatingValue, number>> {
    const where: any = {
      chat: {
        companyId,
        deletedAt: null,
        ...(propertyId ? { propertyId } : {}),
      },
    };

    const ratings = await prisma.chatRating.findMany({
      where,
      select: { rating: true },
    });

    return this.toRatingDistribution(ratings.map((r) => r.rating));
  },

  toRatingDistribution(ratings: RatingValue[]): Record<RatingValue, number> {
    const distribution: Record<RatingValue, number> = {
      POOR: 0,
      FAIR: 0,
      GOOD: 0,
      VERY_GOOD: 0,
      EXCELLENT: 0,
    };

    for (const r of ratings) {
      distribution[r] = (distribution[r] || 0) + 1;
    }

    return distribution;
  },
};

