import type { Response } from "express";
import { upgradeRequestService } from "../services/upgradeRequestService";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { getCompanyIdOrThrow } from "../middlewares/requireCompanyMiddleware";
import { AppError } from "../utils/appError";
import { successResponse } from "../utils/apiResponse";
import { getIO } from "../socket";
import {
  broadcastCompanyProStatusUpdate,
  broadcastUpgradeRequestUpdate,
  type UpgradeRequestBroadcastMeta,
} from "../socket/roomManager";

function emitUpgradeRequestRealtime(
  companyId: string,
  requestId: string,
  requestStatus: string,
  proStatus?: boolean,
  upgradeMeta?: UpgradeRequestBroadcastMeta
) {
  try {
    const io = getIO();
    broadcastUpgradeRequestUpdate(io, companyId, requestId, requestStatus, upgradeMeta);
    if (typeof proStatus === "boolean") {
      broadcastCompanyProStatusUpdate(io, companyId, proStatus);
    }
  } catch {
    // Socket broadcast should not block API response
  }
}

export async function createUpgradeRequestHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const companyId = getCompanyIdOrThrow(req);

  const { name, companyName, email, phone, message } = req.body;

  const request = await upgradeRequestService.createRequest({
    companyId,
    name: name.trim(),
    companyName: companyName.trim(),
    email: email.trim().toLowerCase(),
    phone: phone?.trim() || null,
    message: message?.trim() || null,
  });

  emitUpgradeRequestRealtime(request.companyId, request.id, request.status, undefined, {
    eventKind: "created",
    companyName: request.companyName,
    requesterName: request.name,
  });

  return successResponse(res, { data: request, statusCode: 201 });
}

export async function getUpgradeRequestHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { id } = req.params;
  const user = req.user!; // Guaranteed by authMiddleware

  const request = await upgradeRequestService.getRequestById(id);

  // Only allow company admins to view their own requests, or super admins to view any
  if (!user.isSuperAdmin && request.companyId !== user.companyId) {
    throw new AppError(403, "Forbidden");
  }

  return successResponse(res, { data: request, statusCode: 200 });
}

export async function getMyUpgradeRequestsHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const companyId = getCompanyIdOrThrow(req);

  const requests = await upgradeRequestService.getRequestsByCompany(companyId);
  return successResponse(res, { data: requests, statusCode: 200 });
}

export async function listAllUpgradeRequestsHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const status = req.query?.status as string | undefined;
  const requests = await upgradeRequestService.listAllRequests(status);
  return successResponse(res, { data: requests, statusCode: 200 });
}

export async function approveUpgradeRequestHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { id } = req.params;
  const userId = req.user!.id; // Guaranteed by authMiddleware
  const { notes } = req.body;

  const request = await upgradeRequestService.approveRequest(
    id,
    userId,
    notes
  );

  emitUpgradeRequestRealtime(request.companyId, request.id, request.status, true);

  return successResponse(res, { data: request, statusCode: 200 });
}

export async function rejectUpgradeRequestHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { id } = req.params;
  const userId = req.user!.id; // Guaranteed by authMiddleware
  const { notes } = req.body;

  const request = await upgradeRequestService.rejectRequest(
    id,
    userId,
    notes
  );

  emitUpgradeRequestRealtime(request.companyId, request.id, request.status, false);

  return successResponse(res, { data: request, statusCode: 200 });
}

export async function updateUpgradeRequestStatusHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { id } = req.params;
  const userId = req.user!.id; // Guaranteed by authMiddleware
  const { status, notes } = req.body;

  if (!status) {
    throw new AppError(400, "status is required");
  }

  const request = await upgradeRequestService.updateRequestStatus(
    id,
    status,
    notes,
    userId
  );

  if (request.status === "APPROVED") {
    emitUpgradeRequestRealtime(request.companyId, request.id, request.status, true);
  } else if (["REJECTED", "PENDING", "CONTACTED"].includes(request.status)) {
    emitUpgradeRequestRealtime(request.companyId, request.id, request.status, false);
  } else {
    emitUpgradeRequestRealtime(request.companyId, request.id, request.status);
  }

  return successResponse(res, { data: request, statusCode: 200 });
}
