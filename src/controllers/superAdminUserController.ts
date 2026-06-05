import type { Request, Response } from "express";
import { superAdminUserService } from "../services/superAdminUserService";
import { errorResponse, successResponse } from "../utils/apiResponse";
import { parseBool, parseIntSafe, parseAllowedRole } from "../helpers/admin/queryParsers";
import { Role } from "@prisma/client";

/** Lists platform users; query contract documented in `constants/superAdminUsersListQuery.ts`. */
export async function listAllUsersHandler(req: Request, res: Response) {
  const page = parseIntSafe(req.query.page, 1);
  const limit = parseIntSafe(req.query.limit, 50, 1, 100); // cap at 100

  const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined;

  const roleRaw = req.query.role;
  const role = parseAllowedRole(roleRaw);

  if (roleRaw !== undefined && role === undefined) {
    return errorResponse(res, { message: "Invalid role. Allowed: ADMIN, AGENT", statusCode: 400 });
  }

  const isActiveRaw = req.query.isActive;
  const isActive = parseBool(isActiveRaw);

  if (isActiveRaw !== undefined && isActive === undefined) {
    return errorResponse(res, { message: "Invalid isActive. Use true/false", statusCode: 400 });
  }

  const isProRaw = req.query.isPro;
  const isPro = parseBool(isProRaw);

  if (isProRaw !== undefined && isPro === undefined) {
    return errorResponse(res, { message: "Invalid isPro. Use true/false", statusCode: 400 });
  }

  const search = typeof req.query.search === "string" ? req.query.search : undefined;

  const result = await superAdminUserService.listAllUsers(page, limit, {
    companyId,
    role,
    isActive,
    search,
    isPro,
  });

  return successResponse(res, { data: result, statusCode: 200 });
}

/**
 * Get user details by ID
 * GET /api/super-admin/users/:id
 */
export async function getUserByIdHandler(
  req: Request,
  res: Response
) {
  const { id } = req.params;
  const user = await superAdminUserService.getUserById(id);
  return successResponse(res, { data: user, statusCode: 200 });
}

/**
 * Create admin user for a company
 * POST /api/super-admin/users
 */
export async function createAdminUserHandler(
  req: Request,
  res: Response
) {
  const { email, name, password, companyId, role, isActive } = req.body;

  if (!email || !password || !companyId) {
    return errorResponse(res, {
      message: "email, password, and companyId are required",
      statusCode: 400,
    });
  }

  const user = await superAdminUserService.createAdminUser({
    email,
    name,
    password,
    companyId,
    role: role || Role.ADMIN,
    isActive: isActive !== undefined ? isActive : true,
  });

  return successResponse(res, { data: user, statusCode: 201 });
}

/**
 * Update user
 * PUT /api/super-admin/users/:id
 */
export async function updateUserHandler(
  req: Request,
  res: Response
) {
  const { id } = req.params;
  const { name, email, role, isActive, companyId } = req.body;

  const updated = await superAdminUserService.updateUser(id, {
    name,
    email,
    role,
    isActive,
    companyId,
  });

  return successResponse(res, { data: updated, statusCode: 200 });
}

/**
 * Delete user (soft delete)
 * DELETE /api/super-admin/users/:id
 */
export async function deleteUserHandler(
  req: Request,
  res: Response
) {
  const { id } = req.params;
  await superAdminUserService.deleteUser(id);
  return successResponse(res, { message: "User deleted successfully", statusCode: 200 });
}

/**
 * Activate user
 * POST /api/super-admin/users/:id/activate
 */
export async function activateUserHandler(
  req: Request,
  res: Response
) {
  const { id } = req.params;
  const user = await superAdminUserService.activateUser(id);
  return successResponse(res, { data: user, statusCode: 200 });
}

/**
 * Deactivate user
 * POST /api/super-admin/users/:id/deactivate
 */
export async function deactivateUserHandler(
  req: Request,
  res: Response
) {
  const { id } = req.params;
  const user = await superAdminUserService.deactivateUser(id);
  return successResponse(res, { data: user, statusCode: 200 });
}

/**
 * Reset user password
 * POST /api/super-admin/users/:id/reset-password
 */
export async function resetPasswordHandler(
  req: Request,
  res: Response
) {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword) {
    return errorResponse(res, {
      message: "newPassword is required",
      statusCode: 400,
    });
  }

  await superAdminUserService.resetPassword(id, newPassword);
  return successResponse(res, { message: "Password reset successfully", statusCode: 200 });
}

