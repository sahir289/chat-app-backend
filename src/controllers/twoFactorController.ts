import { Request, Response } from "express";
import { twoFactorService } from "../services/twoFactorService";
import { AppError } from "../utils/appError";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { successResponse } from "../utils/apiResponse";

export async function setup2FAHandler(req: AuthenticatedRequest, res: Response) {
    const userId = req.user?.id;
    if (!userId) {
        throw new AppError(401, "Unauthorized");
    }

    const result = await twoFactorService.setup(userId);

    return successResponse(res, { data: result, statusCode: 200 });
}

export async function verifySetup2FAHandler(req: AuthenticatedRequest, res: Response) {
    const userId = req.user?.id;
    if (!userId) {
        throw new AppError(401, "Unauthorized");
    }

    const { token } = req.body;

    const result = await twoFactorService.verifySetup(userId, token);

    return successResponse(res, { data: result, statusCode: 200 });
}

export async function verify2FAHandler(req: Request, res: Response) {
    const { userId, token } = req.body;

    await twoFactorService.verify(userId, token);

    return successResponse(res, { data: { verified: true }, statusCode: 200 });
}

export async function disable2FAHandler(req: AuthenticatedRequest, res: Response) {
    const userId = req.user?.id;
    if (!userId) {
        throw new AppError(401, "Unauthorized");
    }

    const { password } = req.body;

    await twoFactorService.disable(userId, password);

    return successResponse(res, { message: "2FA disabled successfully", statusCode: 200 });
}

export async function generateBackupCodesHandler(req: AuthenticatedRequest, res: Response) {
    const userId = req.user?.id;
    if (!userId) {
        throw new AppError(401, "Unauthorized");
    }

    const { password } = req.body;

    const result = await twoFactorService.generateBackupCodes(userId, password);

    return successResponse(res, { data: result, statusCode: 200 });
}

