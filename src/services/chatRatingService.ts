import { chatRatingRepository } from "../repositories/chatRatingRepository";
import { chatRepository } from "../repositories/chatRepository";
import { AppError } from "../utils/appError";
import type { RatingValue } from "@prisma/client";

export const chatRatingService = {
  async createRating(data: {
    chatId: string;
    rating: RatingValue;
    comment?: string | null;
    companyId: string;
  }) {
    const chat = await chatRepository.findById(data.chatId, data.companyId);
    if (!chat) {
      throw new AppError(404, "Chat not found");
    }

    const existing = await chatRatingRepository.findByChatId(data.chatId);
    if (existing) {
      return chatRatingRepository.update(data.chatId, {
        rating: data.rating,
        comment: data.comment,
      });
    }

    return chatRatingRepository.create({
      chatId: data.chatId,
      rating: data.rating,
      comment: data.comment,
    });
  },

  async getRatingByChatId(chatId: string, companyId: string) {
    const chat = await chatRepository.findById(chatId, companyId);
    if (!chat) {
      throw new AppError(404, "Chat not found");
    }

    return chatRatingRepository.findByChatId(chatId);
  },

  async listRatings(companyId: string, propertyId?: string, limit: number = 100) {
    return chatRatingRepository.listByCompanyId(companyId, limit, propertyId);
  },

  async getAverageRating(companyId: string, propertyId?: string) {
    return chatRatingRepository.getAverageRating(companyId, propertyId);
  },

  async deleteRating(chatId: string, companyId: string) {
    const chat = await chatRepository.findById(chatId, companyId);
    if (!chat) {
      throw new AppError(404, "Chat not found");
    }

    await chatRatingRepository.delete(chatId);
  },

  async createRatingByVisitor(data: {
    chatId: string;
    sessionId: string;
    rating: RatingValue;
    comment?: string | null;
  }): Promise<{ rating: Awaited<ReturnType<typeof chatRatingRepository.create>> | Awaited<ReturnType<typeof chatRatingRepository.update>>; chatClosed: boolean }> {
    // Verify chat belongs to sessionId (visitor authentication)
    const chat = await chatRepository.findById(data.chatId);
    if (!chat) {
      throw new AppError(404, "Chat not found");
    }

    if (chat.sessionId !== data.sessionId) {
      throw new AppError(403, "Chat does not belong to this session");
    }

    // Only allow rating once the widget has moved into feedback-pending or closed state.
    if (chat.status === "ACTIVE") {
      throw new AppError(400, "Cannot rate an active chat. Please end the chat first.");
    }

    const existing = await chatRatingRepository.findByChatId(data.chatId);
    const rating = existing
      ? await chatRatingRepository.update(data.chatId, {
          rating: data.rating,
          comment: data.comment,
        })
      : await chatRatingRepository.create({
          chatId: data.chatId,
          rating: data.rating,
          comment: data.comment,
        });

    let chatClosed = false;
    if (chat.status !== "CLOSED") {
      await chatRepository.update(chat.id, chat.companyId, {
        status: "CLOSED",
        closedAt: new Date(),
      });
      chatClosed = true;
    }

    return {
      rating,
      chatClosed,
    };
  },

  async getRatingByVisitor(chatId: string, sessionId: string) {
    const chat = await chatRepository.findById(chatId);
    if (!chat) {
      throw new AppError(404, "Chat not found");
    }

    if (chat.sessionId !== sessionId) {
      throw new AppError(403, "Chat does not belong to this session");
    }

    return chatRatingRepository.findByChatId(chatId);
  },
};

