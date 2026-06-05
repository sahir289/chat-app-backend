import type { Request, Response } from "express";
import { Role } from "@prisma/client";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { userRepository } from "../repositories/userRepository";
import { authService } from "../services/authService";
import { successResponse, errorResponse } from "../utils/apiResponse";
import { teamService } from "../services/teamService";
import { getPresignedUrl } from "../services/s3Service";
import { enforceFreePlanAgentLimit } from "../helpers/agentLimitEnforcement";
import prisma from "../lib/prisma";

export async function listUsersHandler(
  req: Request,
  res: Response
) {
  const companyId = (req as AuthenticatedRequest).user?.companyId;
  if (!companyId) {
    return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });
  }

  // Parse pagination parameters
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 3;
  const offset = (page - 1) * limit;

  const includeAdminsQuery = req.query.includeAdmins;
  const includeAdmins =
    typeof includeAdminsQuery === "string" && includeAdminsQuery.toLowerCase() === "true";

  const roleQuery = typeof req.query.role === "string" ? req.query.role.toUpperCase() : undefined;
  const validRoles: Role[] = Object.values(Role);
  const requestedRole = roleQuery && validRoles.includes(roleQuery as Role)
    ? (roleQuery as Role)
    : undefined;

  // Default behavior: list agents only unless explicitly requesting admins.
  const roleFilter: Role[] | undefined = requestedRole
    ? [requestedRole]
    : includeAdmins
      ? undefined
      : [Role.AGENT];

  const { users, total } = await userRepository.listByCompany(companyId, limit, offset, roleFilter);

  const totalPages = Math.ceil(total / limit);

  // Generate signed URLs for avatars
  const usersWithSignedUrls = await Promise.all(
    users.map(async (u) => {
      let avatarUrl: string | null = null;
      if (u.avatarUrl && u.companyId) {
        try {
          const signedUrl = await getPresignedUrl(u.avatarUrl, u.companyId, 3600);
          if (signedUrl && (signedUrl.startsWith('http://') || signedUrl.startsWith('https://'))) {
            avatarUrl = signedUrl;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
        }
      }
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        isOwner: u.isOwner,
        isActive: u.isActive,
        avatarUrl,
        lastSeen: u.lastSeen,
        createdAt: u.createdAt,
      };
    })
  );

  return successResponse(res, {
    data: {
      data: usersWithSignedUrls,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    },
    statusCode: 200,
  });
}

export async function getUserHandler(
  req: Request,
  res: Response
) {
  const { id } = req.params;
  const companyId = (req as AuthenticatedRequest).user?.companyId;
  if (!companyId) {
    return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });
  }

  const user = await userRepository.findById(id);
  if (!user || user.companyId !== companyId) {
    return errorResponse(res, { message: "User not found", statusCode: 404 });
  }

  // Generate signed URL for avatar
  let avatarUrl: string | null = null;
  if (user.avatarUrl && user.companyId) {
    try {
      const signedUrl = await getPresignedUrl(user.avatarUrl, user.companyId, 3600);
      if (signedUrl && (signedUrl.startsWith('http://') || signedUrl.startsWith('https://'))) {
        avatarUrl = signedUrl;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  return successResponse(res, {
    data: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isOwner: user.isOwner,
      isActive: user.isActive,
      avatarUrl,
      lastSeen: user.lastSeen,
      createdAt: user.createdAt,
    },
    statusCode: 200,
  });
}

export async function createUserHandler(
  req: Request,
  res: Response
) {
  const companyId = (req as AuthenticatedRequest).user?.companyId;
  if (!companyId) {
    return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });
  }

  const { email, name, role } = req.body ?? {};
  if (!email || !name) {
    return errorResponse(res, { message: "Email and name are required", statusCode: 400 });
  }
  const roleCandidate = typeof role === "string" ? role.toUpperCase() : undefined;
  const parsedRole =
    roleCandidate && (Object.values(Role) as string[]).includes(roleCandidate)
      ? (roleCandidate as Role)
      : undefined;
  const result = await teamService.inviteAgent(companyId, email, name, parsedRole ?? Role.AGENT);

  return successResponse(res, { data: result, statusCode: 201 });
}

export async function updateUserHandler(
  req: Request,
  res: Response
) {
  const { id } = req.params;
  const companyId = (req as AuthenticatedRequest).user?.companyId;
  const currentUser = (req as AuthenticatedRequest).user;
  if (!companyId) {
    return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });
  }
  if (!currentUser) {
    return errorResponse(res, { message: "Unauthorized", statusCode: 401 });
  }

  const user = await userRepository.findById(id);
  if (!user || user.companyId !== companyId) {
    return errorResponse(res, { message: "User not found", statusCode: 404 });
  }

  const { name, email, avatarUrl, role, isActive } = req.body ?? {};

  const isSelf = currentUser.id === id;
  const isAdmin = currentUser.role === Role.ADMIN;

  if (isSelf) {
    const updated = await userRepository.updateByCompanyId(id, companyId, {
      ...(name !== undefined && { name }),
      ...(email !== undefined && { email }),
      ...(avatarUrl !== undefined && { avatarUrl }),
    });
    return successResponse(res, { data: updated, statusCode: 200 });
  }

  if (isAdmin) {
    const updated = await userRepository.updateByCompanyId(id, companyId, {
      ...(name !== undefined && { name }),
      ...(email !== undefined && { email }),
      ...(avatarUrl !== undefined && { avatarUrl }),
      ...(role !== undefined && { role }),
      ...(isActive !== undefined && { isActive }),
    });
    return successResponse(res, { data: updated, statusCode: 200 });
  }

  return errorResponse(res, { message: "Forbidden", statusCode: 403 });
}

export async function deleteUserHandler(
  req: Request,
  res: Response
) {
  const { id } = req.params;
  const companyId = (req as AuthenticatedRequest).user?.companyId;
  if (!companyId) {
    return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });
  }

  const user = await userRepository.findById(id);
  if (!user || user.companyId !== companyId) {
    return errorResponse(res, { message: "User not found", statusCode: 404 });
  }

  // Delete upgrade requests for the user's company
  await prisma.$transaction(async (tx) => {
    // Delete upgrade requests
    await tx.upgradeRequest.deleteMany({
      where: { companyId },
    });

    // Soft delete user and set isActive to false
    await tx.user.update({
      where: { id, companyId },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    // Check if there are any active users left in the company
    const activeUsersCount = await tx.user.count({
      where: {
        companyId,
        deletedAt: null,
        isActive: true,
      },
    });

    // If no active users remain, deactivate the company
    if (activeUsersCount === 0) {
      await tx.company.update({
        where: { id: companyId },
        data: {
          isActive: false,
        },
      });
    }
  });

  return successResponse(res, { data: { success: true }, statusCode: 200 });
}

export async function activateUserHandler(
  req: Request,
  res: Response
) {
  const { id } = req.params;
  const companyId = (req as AuthenticatedRequest).user?.companyId;
  if (!companyId) {
    return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });
  }

  const user = await userRepository.findById(id);
  if (!user || user.companyId !== companyId) {
    return errorResponse(res, { message: "User not found", statusCode: 404 });
  }

  const newActiveState = !user.isActive;

  // Use transaction to ensure atomicity
  const updated = await prisma.$transaction(async (tx) => {
    // If activating, enforce free plan agent limit
    // Only check for AGENT role users on free plan
    if (newActiveState && user.role === Role.AGENT && user.companyId) {
      await enforceFreePlanAgentLimit(user.companyId, tx, id);
    }

    // Update user active state
    const updatedUser = await tx.user.update({
      where: { id, companyId },
      data: { isActive: newActiveState },
    });

    // If deactivating, revoke all refresh tokens
    if (!newActiveState) {
      await tx.refreshToken.updateMany({
        where: {
          userId: id,
          revokedAt: null, // Only revoke tokens that aren't already revoked
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }

    return updatedUser;
  }, {
    maxWait: 5000,
    timeout: 10000,
  });

  return successResponse(res, { data: { isActive: updated.isActive }, statusCode: 200 });
}

export async function updateUserSettingsHandler(
  req: Request,
  res: Response
) {
  const userId = (req as AuthenticatedRequest).user?.id;
  if (!userId) {
    return errorResponse(res, { message: "Unauthorized", statusCode: 401 });
  }

  const { notificationsEnabled, chatSound, theme, browserAlerts } = req.body ?? {};

  const settings = await authService.updateSettings(userId, {
    notificationsEnabled,
    chatSound,
    theme,
    browserAlerts,
  });

  return successResponse(res, { data: settings, statusCode: 200 });
}
