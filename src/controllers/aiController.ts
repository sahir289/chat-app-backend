import type { Response } from "express";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { getCompanyIdOrThrow } from "../middlewares/requireCompanyMiddleware";
import { aiCreditsService, toPublicAiUsageSummary } from "../services/aiCreditsService";
import { errorResponse, successResponse } from "../utils/apiResponse";

export async function getAiUsageHandler(
    req: AuthenticatedRequest,
    res: Response
) {
    const companyId = getCompanyIdOrThrow(req);

    const usage = await aiCreditsService.getUsage(companyId);
    return successResponse(res, { data: toPublicAiUsageSummary(usage), statusCode: 200 });
}

export async function getAiUsageHistoryHandler(
    req: AuthenticatedRequest,
    res: Response
) {
    const companyId = getCompanyIdOrThrow(req);

    const { startDate, endDate, page, limit } = req.query as {
        startDate?: string;
        endDate?: string;
        page?: string;
        limit?: string;
    };

    const parsedPage = Math.max(1, parseInt(page || "1", 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit || "10", 10) || 10));

    const parsedStartDate = startDate ? new Date(startDate) : undefined;
    const parsedEndDate = endDate ? new Date(endDate) : undefined;

    if (startDate && Number.isNaN(parsedStartDate?.getTime())) {
        return errorResponse(res, {
            message: "Invalid startDate",
            statusCode: 400,
        });
    }

    if (endDate && Number.isNaN(parsedEndDate?.getTime())) {
        return errorResponse(res, {
            message: "Invalid endDate",
            statusCode: 400,
        });
    }

    if (parsedStartDate && parsedEndDate && parsedStartDate > parsedEndDate) {
        return errorResponse(res, {
            message: "startDate cannot be after endDate",
            statusCode: 400,
        });
    }

    const history = await aiCreditsService.getUsageHistory(
        companyId,
        parsedPage,
        parsedLimit,
        parsedStartDate,
        parsedEndDate
    );

    return successResponse(res, {
        data: {
            items: history.items.map((item) => ({
                usedAt: item.usedAt,
                usageCount: item.usageCount,
                creditsConsumed: item.creditsConsumed,
                topupCreditsConsumed: item.topupCreditsConsumed,
            })),
            totals: {
                creditsConsumed: history.totals.creditsConsumed,
            },
            pagination: history.pagination,
        },
        statusCode: 200,
    });
}
