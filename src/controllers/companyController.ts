import type { Request, Response } from "express";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { companyService } from "../services/companyService";
import { moduleControlService } from "../services/moduleControlService";
import { aiCreditsService } from "../services/aiCreditsService";
import { notifyCompanyUsersOfProUpgrade } from "../services/emailService";
import { leadRepository } from "../repositories/leadRepository";
import {
  uploadFileToS3ByKey,
  buildLogoS3Key,
  getPresignedUrl
} from "../services/s3Service";
import { companyRepository } from "../repositories/companyRepository";
import { uploadMiddleware } from "../middlewares/uploadMiddleware";
import { asyncHandler } from "../middlewares/asyncHandler";
import { getIO } from "../socket/index";
import { Role } from "@prisma/client";
import {
  broadcastCompanyOpenAiModelsUpdate,
  broadcastCompanyProStatusUpdate,
  broadcastUpgradeRequestUpdate,
} from "../socket/roomManager";
import { errorResponse, successResponse } from "../utils/apiResponse";
import { AppError } from "../utils/appError";
import { getCompanyIdOrThrow } from "../middlewares/requireCompanyMiddleware";

export async function getCompanyHandler(
  req: Request,
  res: Response
) {
  const authReq = req as AuthenticatedRequest;
  const user = authReq.user!; // authMiddleware guarantees user exists

  // Service layer handles all validation (SUPER_ADMIN check, companyId check, etc.)
  const company = await companyService.getMyCompany(user.id);
  return successResponse(res, { data: company, statusCode: 200 });
}

export async function updateCompanyHandler(
  req: Request,
  res: Response
) {
  const authReq = req as AuthenticatedRequest;
  const user = authReq.user!; // authMiddleware guarantees user exists

  const { name, email, phone } = req.body;

  const companyId = getCompanyIdOrThrow(authReq);

  const updated = await companyService.update(
    companyId,
    { name, email, phone },
    user.id,
    user.role
  );

  return successResponse(res, { data: updated, statusCode: 200 });
}

export async function getCompanyByIdHandler(
  req: Request,
  res: Response
) {
  const authReq = req as AuthenticatedRequest;
  const user = authReq.user!; // authMiddleware guarantees user exists

  const { id } = req.params;
  // Service layer handles all validation (authorization, company existence, etc.)
  const company = await companyService.getById(id, user.id, user.role);

  return successResponse(res, { data: company, statusCode: 200 });
}

export async function createCompanyHandler(
  req: Request,
  res: Response
) {
  const authReq = req as AuthenticatedRequest;
  const user = authReq.user!; // authMiddleware guarantees user exists

  const { name, email, phone, slug } = req.body;
  // Service layer handles all validation (slug uniqueness, etc.)
  const company = await companyService.create({
    name,
    email,
    phone,
    slug,
    createdBySuperAdminId: user.id,
  });

  return successResponse(res, { data: company, statusCode: 201 });
}

export async function listCompaniesHandler(
  req: Request,
  res: Response
) {
  const page = typeof req.query.page === "string" ? Number(req.query.page) : 1;
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 10;
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const plan = typeof req.query.plan === "string" ? req.query.plan : undefined;

  const statusFilter = status === "all" ? undefined : (status as any);
  const planFilter = plan === "all" ? undefined : (plan as any);

  const result = await companyService.listAll(
    Number.isFinite(page) ? page : 1,
    Number.isFinite(limit) ? limit : 10,
    search,
    statusFilter,
    planFilter
  );
  return successResponse(res, { data: result, statusCode: 200 });
}

export async function suspendCompanyHandler(
  req: Request,
  res: Response
) {
  const { id } = req.params;
  const { suspensionReason } = req.body;

  const company = await companyService.suspend(id, { suspensionReason });
  return successResponse(res, { data: company, statusCode: 200 });
}

export async function activateCompanyHandler(
  req: Request,
  res: Response
) {
  const { id } = req.params;
  const userId = (req as AuthenticatedRequest).user?.id;

  const company = await companyService.activate(id, userId);
  return successResponse(res, { data: company, statusCode: 200 });
}

export async function toggleProStatusHandler(
  req: Request,
  res: Response
) {
  const { id } = req.params;
  const { isPro, billingCycle } = req.body;
  const userId = (req as AuthenticatedRequest).user?.id;

  const companyBefore = await companyService.getById(id);

  const company = await companyService.toggleProStatus(id, isPro, userId, billingCycle);

  if (userId) {
    try {
      if (isPro) {
        await moduleControlService.enableAllModules(
          id,
          userId,
          "PRO access enabled via toggle"
        );
      } else {
        await moduleControlService.setFreePlanModules(
          id,
          userId,
          "PRO access disabled via toggle - set to FREE plan modules"
        );
      }
    } catch {
      // Error logged/handled by module control service
    }
  }

  if (isPro && companyBefore && !companyBefore.isPro) {

    notifyCompanyUsersOfProUpgrade(id, company.name).catch(() => {
      // Error logged/handled by email service
    });
  }

  if (userId) {
    try {
      const io = getIO();
      // Service syncs latest upgrade request status to APPROVED/CONTACTED on toggle.
      // Emit a generic update event so clients refresh request lists in real time.
      broadcastUpgradeRequestUpdate(io, id, "", isPro ? "APPROVED" : "CONTACTED");
    } catch {
      // Socket event is non-blocking
    }
  }

  // Emit socket event for real-time updates
  try {
    const io = getIO();
    broadcastCompanyProStatusUpdate(io, id, isPro);
  } catch {
    // Error logged/handled by socket service
  }

  return successResponse(res, { data: company, statusCode: 200 });
}

export async function getCompanyLeadsHandler(
  req: Request,
  res: Response
) {
  const { id: companyId } = req.params;
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
  const page = 1;

  const safeLimit = Number.isFinite(limit) ? limit : 50;
  const leads = await leadRepository.findByCompanyId(companyId, safeLimit);
  const total = await leadRepository.count({ companyId });

  return successResponse(res, {
    data: leads,
    pagination: {
      page,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    },
    statusCode: 200,
  });
}

export async function updateCompanyOpenAiChatModelsHandler(
  req: Request,
  res: Response
) {
  const { id } = req.params;
  const { modelIds } = (req.body ?? {}) as { modelIds?: string[] };
  const updated = await companyService.updateAllowedOpenAiChatModels(id, Array.isArray(modelIds) ? modelIds : []);
  try {
    const io = getIO();
    broadcastCompanyOpenAiModelsUpdate(io, id, updated.allowedOpenAiChatModels ?? []);
  } catch {
    // Socket event is non-blocking
  }
  return successResponse(res, { data: updated, statusCode: 200 });
}

export async function getCompanyAiCreditsHandler(
  req: Request,
  res: Response
) {
  const { id } = req.params;
  const usage = await aiCreditsService.getUsage(id);
  return successResponse(res, { data: usage, statusCode: 200 });
}

export async function updateCompanyAiCreditsHandler(
  req: Request,
  res: Response
) {
  const { id } = req.params;
  const { monthlyCredits, tokensPerCredit, resetTopup } = req.body as {
    monthlyCredits?: number;
    tokensPerCredit?: number;
    resetTopup?: boolean;
  };

  const usage = await aiCreditsService.updateCompanyCredits(id, {
    ...(monthlyCredits !== undefined ? { monthlyCredits } : {}),
    ...(tokensPerCredit !== undefined ? { tokensPerCredit } : {}),
    ...(resetTopup !== undefined ? { resetTopup } : {}),
  });

  return successResponse(res, { data: usage, statusCode: 200 });
}

export async function createCompanyAiTopupHandler(
  req: Request,
  res: Response
) {
  const { id } = req.params;
  const { creditsAdded, amount } = req.body as {
    creditsAdded: number;
    amount: number;
  };

  const result = await aiCreditsService.createTopup(id, {
    creditsAdded,
    amount,
  });

  return successResponse(res, { data: result, statusCode: 201 });
}

export async function getCompanyAiUsageHistoryHandler(
  req: Request,
  res: Response
) {
  const { id } = req.params;
  const { startDate, endDate, page, limit } = req.query as {
    startDate?: string;
    endDate?: string;
    page?: string;
    limit?: string;
  };
  const history = await aiCreditsService.getUsageHistory(
    id,
    Math.max(1, parseInt(page || "1", 10) || 1),
    Math.max(1, parseInt(limit || "10", 10) || 10),
    startDate ? new Date(startDate) : undefined,
    endDate ? new Date(endDate) : undefined
  );
  return successResponse(res, { data: history, statusCode: 200 });
}

export const uploadCompanyLogoHandler = [
  uploadMiddleware.images.single("logo"),
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!; // authMiddleware guarantees user exists

    // Validate file upload
    const file = req.file;
    if (!file) {
      throw new AppError(400, "Logo file is required");
    }

    const companyId = getCompanyIdOrThrow(authReq);

    // Authorization check - only owner can upload logo
    if (user.role !== Role.SUPER_ADMIN && !user.isOwner) {
      return errorResponse(res, {
        message: "Only company owner can upload logo",
        statusCode: 403,
      });
    }

    // Verify company exists
    const company = await companyRepository.findById(companyId);
    if (!company) {
      return errorResponse(res, { message: "Company not found", statusCode: 404 });
    }

    const s3Key = buildLogoS3Key(companyId, file.originalname, new Date(), company.name);

    const logoS3Key = await uploadFileToS3ByKey(
      file.buffer,
      s3Key,
      file.mimetype
    );

    await companyRepository.update(companyId, { logo: logoS3Key });

    const logoUrl = await getPresignedUrl(logoS3Key, companyId, 3600);
    return successResponse(res, {
      data: {
        logo: logoUrl,
      },
      statusCode: 200
    });
  }),
];
