import type { Request, Response } from "express";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { aiCreditsAddonRequestService } from "../services/aiCreditsAddonRequestService";
import { emitAiCreditsUpdated } from "../socket/emitAiCreditsUpdate";
import { errorResponse, successResponse } from "../utils/apiResponse";

export async function createAiCreditsAddonRequestHandler(req: Request, res: Response) {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;

    if (!user.companyId) {
        return errorResponse(res, {
            message: "User is not associated with a company",
            statusCode: 400,
        });
    }

    const { message, requestedCredits } = req.body as {
        message?: string | null;
        requestedCredits?: number | null;
    };

    const request = await aiCreditsAddonRequestService.createRequest({
        companyId: user.companyId,
        message,
        requestedCredits,
    });

    emitAiCreditsUpdated(user.companyId);

    return successResponse(res, { data: request, statusCode: 201 });
}

export async function listMyAiCreditsAddonRequestsHandler(req: Request, res: Response) {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;

    if (!user.companyId) {
        return errorResponse(res, {
            message: "User is not associated with a company",
            statusCode: 400,
        });
    }

    const requests = await aiCreditsAddonRequestService.listForCompany(user.companyId);
    return successResponse(res, { data: requests, statusCode: 200 });
}

export async function listAllAiCreditsAddonRequestsHandler(req: Request, res: Response) {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const requests = await aiCreditsAddonRequestService.listAllForAdmin(status);
    return successResponse(res, { data: requests, statusCode: 200 });
}

export async function updateAiCreditsAddonRequestStatusHandler(req: Request, res: Response) {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;
    const { id } = req.params;
    const { status, notes } = req.body as { status: "FULFILLED" | "REJECTED"; notes?: string | null };

    const updated = await aiCreditsAddonRequestService.updateRequestStatus({
        requestId: id,
        superAdminUserId: user.id,
        status,
        notes,
    });

    emitAiCreditsUpdated(updated.companyId);

    return successResponse(res, { data: updated, statusCode: 200 });
}
