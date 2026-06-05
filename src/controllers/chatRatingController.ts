import type { Request, Response } from "express";
import { chatRatingService } from "../services/chatRatingService";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import type { RatingValue } from "@prisma/client";
import { getCompanyIdOrThrow } from "../middlewares/requireCompanyMiddleware";
import { successResponse } from "../utils/apiResponse";
import { getIO, getChatRoom, getPropertyRoom } from "../socket/index";
import { chatRepository } from "../repositories/chatRepository";

export async function createRatingHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { chatId } = req.params;
  const companyId = getCompanyIdOrThrow(req);
  const { rating, comment } = req.body as { rating: RatingValue; comment?: string | null };

  const chatRating = await chatRatingService.createRating({
    chatId,
    rating,
    comment,
    companyId,
  });

  return successResponse(res, { data: chatRating, statusCode: 201 });
}

export async function getRatingHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { chatId } = req.params;
  const companyId = getCompanyIdOrThrow(req);

  const rating = await chatRatingService.getRatingByChatId(chatId, companyId);
  return successResponse(res, { data: rating, statusCode: 200 });
}

export async function listRatingsHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const companyId = getCompanyIdOrThrow(req);

  const propertyId = req.query.propertyId as string | undefined;
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;

  const ratings = await chatRatingService.listRatings(companyId, propertyId, limit ?? 100);
  return successResponse(res, { data: ratings, statusCode: 200 });
}

export async function getAverageRatingHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const companyId = getCompanyIdOrThrow(req);

  const propertyId = req.query.propertyId as string | undefined;
  const average = await chatRatingService.getAverageRating(companyId, propertyId);
  return successResponse(res, { data: { average }, statusCode: 200 });
}

export async function deleteRatingHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { chatId } = req.params;
  const companyId = getCompanyIdOrThrow(req);

  await chatRatingService.deleteRating(chatId, companyId);
  return successResponse(res, { statusCode: 200 });
}

// Visitor rating handlers (no auth required, validates via sessionId)
export async function createVisitorRatingHandler(
  req: Request,
  res: Response
) {
  const { chatId } = req.params as { chatId: string };
  const { sessionId, rating, comment } = req.body as {
    sessionId: string;
    rating: RatingValue;
    comment?: string | null;
  };

  const result = await chatRatingService.createRatingByVisitor({
    chatId,
    sessionId,
    rating,
    comment,
  });

  if (result.chatClosed) {
    const chat = await chatRepository.findById(chatId);
    if (chat) {
      const io = getIO();
      io.to(getChatRoom(chatId)).emit("chat:closed", { chatId });
      io.to(getPropertyRoom(chat.propertyId)).emit("chat:updated", { chatId });
    }
  }

  return successResponse(res, { data: result.rating, statusCode: 201 });
}

export async function getVisitorRatingHandler(
  req: Request,
  res: Response
) {
  const { chatId } = req.params as { chatId: string };
  const { sessionId } = req.query as { sessionId: string };

  const rating = await chatRatingService.getRatingByVisitor(chatId, sessionId);
  return successResponse(res, { data: rating, statusCode: 200 });
}
