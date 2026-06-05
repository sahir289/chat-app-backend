import prisma from "../lib/prisma";
import type { ChatRating, RatingValue } from "@prisma/client";

export const chatRatingRepository = {
  async findByChatId(chatId: string): Promise<ChatRating | null> {
    return prisma.chatRating.findUnique({
      where: { chatId },
      include: {
        chat: {
          select: {
            id: true,
            propertyId: true,
            companyId: true,
          },
        },
      },
    });
  },

  async create(data: {
    chatId: string;
    rating: RatingValue;
    comment?: string | null;
  }): Promise<ChatRating> {
    return prisma.chatRating.create({
      data,
      include: {
        chat: {
          select: {
            id: true,
            propertyId: true,
            companyId: true,
          },
        },
      },
    });
  },

  async update(chatId: string, data: {
    rating?: RatingValue;
    comment?: string | null;
  }): Promise<ChatRating> {
    return prisma.chatRating.update({
      where: { chatId },
      data,
      include: {
        chat: {
          select: {
            id: true,
            propertyId: true,
            companyId: true,
          },
        },
      },
    });
  },

  async delete(chatId: string): Promise<void> {
    await prisma.chatRating.delete({
      where: { chatId },
    });
  },

  async listByCompanyId(
    companyId: string,
    limit: number = 100,
    propertyId?: string
  ): Promise<ChatRating[]> {
    return prisma.chatRating.findMany({
      where: {
        chat: {
          companyId,
          ...(propertyId ? { propertyId } : {}),
        },
      },
      include: {
        chat: {
          select: {
            id: true,
            propertyId: true,
            companyId: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },

  async getAverageRating(companyId: string, propertyId?: string): Promise<number> {
    const where: any = {
      chat: {
        companyId,
      },
    };

    if (propertyId) {
      where.chat.propertyId = propertyId;
    }

    const ratings = await prisma.chatRating.findMany({
      where,
      select: {
        rating: true,
      },
    });

    if (ratings.length === 0) return 0;

    const ratingMap: Record<RatingValue, number> = {
      POOR: 1,
      FAIR: 2,
      GOOD: 3,
      VERY_GOOD: 4,
      EXCELLENT: 5,
    };

    const sum = ratings.reduce((acc, r) => acc + (ratingMap[r.rating] || 0), 0);
    return sum / ratings.length;
  },
};

