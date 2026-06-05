import type { Request, Response } from "express";
import { faqService } from "../services/faqService";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { AppError } from "../utils/appError";
import { getCompanyIdOrThrow } from "../middlewares/requireCompanyMiddleware";
import { successResponse } from "../utils/apiResponse";

export async function createFAQHandler(
    req: AuthenticatedRequest,
    res: Response
): Promise<void> {
    const companyId = getCompanyIdOrThrow(req);
    // userId is guaranteed to exist after authMiddleware
    const userId = req.user!.id;

    const { propertyId, question, answer, order, isActive } = req.body;

    // Business logic in service (validation is handled by route middleware)
    const faq = await faqService.createFAQ({
        userId,
        companyId,
        propertyId,
        question,
        answer,
        order,
        isActive,
    });

    successResponse(res, { data: faq, statusCode: 201 });
}

export async function getFAQsHandler(
    req: AuthenticatedRequest,
    res: Response
): Promise<void> {
    const companyId = getCompanyIdOrThrow(req);
    // userId is guaranteed to exist after authMiddleware
    const userId = req.user!.id;

    const { propertyId } = req.params;
    const includeInactive = req.query.includeInactive === "true";

    // Business logic in service (validation is handled by route middleware)
    const faqs = await faqService.getFAQsByProperty(
        userId,
        companyId,
        propertyId,
        includeInactive
    );

    successResponse(res, { data: faqs, statusCode: 200 });
  }

export async function updateFAQHandler(
    req: AuthenticatedRequest,
    res: Response
): Promise<void> {
    const companyId = getCompanyIdOrThrow(req);
    // userId is guaranteed to exist after authMiddleware
    const userId = req.user!.id;

    const { id } = req.params;
    const { question, answer, order, isActive } = req.body;

    // Business logic in service (validation is handled by route middleware)
    const faq = await faqService.updateFAQ({
        userId,
        companyId,
        faqId: id,
        question,
        answer,
        order,
        isActive,
    });

    successResponse(res, { data: faq, statusCode: 200 });
  }

export async function deleteFAQHandler(
    req: AuthenticatedRequest,
    res: Response
): Promise<void> {
    const companyId = getCompanyIdOrThrow(req);
    // userId is guaranteed to exist after authMiddleware
    const userId = req.user!.id;

    const { id } = req.params;

    // Business logic in service (validation is handled by route middleware)
    await faqService.deleteFAQ(userId, companyId, id);

    successResponse(res, { statusCode: 200 });
  }

export async function searchFAQsHandler(
    req: Request,
    res: Response
): Promise<void> {
    const { propertyId } = req.params;
    const { query, limit } = req.query;

    // Validation is handled by route middleware
    const limitNum = limit ? parseInt(limit as string, 10) : 10;

    // Business logic in service
    const faqs = await faqService.searchFAQs(propertyId, query as string, limitNum);

    successResponse(res, { data: faqs, statusCode: 200 });
  }

