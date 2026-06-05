import { enforceFreePlanAgentLimit } from "../helpers/agentLimitEnforcement";
import {
  isUserOperationallyActive,
  whereOperationallyActiveUsers,
  whereOperationallyInactiveUsers,
} from "../helpers/userOperationalStatus";
import prisma from "../lib/prisma";
import { AppError } from "../utils/appError";
import { hashPassword } from "../utils/hash";
import { Prisma, Role } from "@prisma/client";

type AllowedUserRole = Exclude<Role, "SUPER_ADMIN">;

type CreateAdminUserInput = {
  email: string;
  name?: string;
  password: string;
  companyId: string;
  role?: AllowedUserRole;
  isActive?: boolean;
};

type UpdateUserInput = {
  name?: string;
  email?: string;
  role?: AllowedUserRole;
  isActive?: boolean;
  companyId?: string;
};

export const superAdminUserService = {
  /**
   * List all users across all companies (Super Admin only)
   */
  async listAllUsers(page: number = 1, limit: number = 50, filters?: {
    companyId?: string;
    role?: AllowedUserRole;
    isActive?: boolean;
    search?: string;
    isPro?: boolean;
  }) {
    const skip = (page - 1) * limit;

    // Build company filter for isPro (if specified)
    const companyFilter: Prisma.CompanyWhereInput = {};
    if (filters?.isPro !== undefined) {
      companyFilter.isPro = filters.isPro;
      companyFilter.deletedAt = null;
    }

    // Build search OR conditions
    const searchConditions: Prisma.UserWhereInput[] = [];
    if (filters?.search) {
      searchConditions.push(
        { email: { contains: filters.search, mode: "insensitive" } },
        { name: { contains: filters.search, mode: "insensitive" } }
      );

      // Add company name search
      const companySearchFilter: Prisma.CompanyWhereInput = {
        name: { contains: filters.search, mode: "insensitive" },
        deletedAt: null,
      };
      // If isPro filter is set, include it in the company search filter
      // (the top-level company filter will also apply, but we include it here for clarity)
      if (filters?.isPro !== undefined) {
        companySearchFilter.isPro = filters.isPro;
      }
      searchConditions.push({ company: companySearchFilter });
    }

    const andClauses: Prisma.UserWhereInput[] = [];
    if (filters?.isPro !== undefined) {
      andClauses.push({ company: companyFilter });
    }
    if (filters?.isActive === true) {
      andClauses.push(whereOperationallyActiveUsers());
    } else if (filters?.isActive === false) {
      andClauses.push(whereOperationallyInactiveUsers());
    }

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      // Super Admin users are excluded from this list
      isSuperAdmin: false,
      ...(filters?.companyId && { companyId: filters.companyId }),
      ...(filters?.role && { role: filters.role }),
      ...(searchConditions.length > 0 && { OR: searchConditions }),
      ...(andClauses.length > 0 && { AND: andClauses }),
    };

    const [usersRaw, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          emailVerified: true,
          avatarUrl: true,
          createdAt: true,
          updatedAt: true,
          lastSeen: true,
          company: {
            select: {
              id: true,
              name: true,
              slug: true,
              isActive: true,
              isSuspended: true,
              deletedAt: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const users = usersRaw.map((u) => {
      const { emailVerified: _ev, ...rest } = u;
      return {
        ...rest,
        isActive: isUserOperationallyActive(
          { isActive: u.isActive, emailVerified: u.emailVerified },
          u.company
        ),
        company: u.company
          ? {
            id: u.company.id,
            name: u.company.name,
            slug: u.company.slug,
          }
          : null,
      };
    });

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get user details by ID (Super Admin can access any user)
   */
  async getUserById(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        isSuperAdmin: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
        lastSeen: true,
        timezone: true,
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
            email: true,
            phone: true,
            isActive: true,
            isSuspended: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError(404, "User not found");
    }

    return user;
  },

  /**
   * Create an admin user for a company (Super Admin only)
   */
  async createAdminUser(input: CreateAdminUserInput) {
    const { email, name, password, companyId, role = Role.ADMIN, isActive = true } = input;

    // Validate email
    const normalizedEmail = email.toLowerCase().trim();
    if (!normalizedEmail) {
      throw new AppError(400, "Email is required");
    }

    // Check if company exists
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new AppError(404, "Company not found");
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new AppError(400, "User with this email already exists");
    }

    // Password strength validation is handled by middleware

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Check if this will be the first user (owner) for the company
    const userCount = await prisma.user.count({
      where: { companyId, deletedAt: null },
    });
    const isOwner = userCount === 0;

    // Create user
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: name?.trim() || null,
        password: hashedPassword,
        role,
        companyId,
        isActive,
        isOwner,
        isSuperAdmin: false, // Super Admin cannot create another Super Admin via this service
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        isOwner: true,
        createdAt: true,
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Create user settings
    await prisma.userSettings.create({
      data: {
        userId: user.id,
      },
    });

    return user;
  },

  /**
   * Update user (Super Admin can update any user)
   */
  async updateUser(userId: string, input: UpdateUserInput) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError(404, "User not found");
    }

    // Prevent updating Super Admin users
    if (user.isSuperAdmin) {
      throw new AppError(403, "Cannot update Super Admin user");
    }

    // If email is being updated, check if it's already taken
    if (input.email) {
      const normalizedEmail = input.email.toLowerCase().trim();
      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (existingUser && existingUser.id !== userId) {
        throw new AppError(400, "Email is already taken");
      }
    }

    // If companyId is being updated, verify company exists
    if (input.companyId) {
      const company = await prisma.company.findUnique({
        where: { id: input.companyId },
      });

      if (!company) {
        throw new AppError(404, "Company not found");
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined && { name: input.name?.trim() || null }),
        ...(input.email !== undefined && { email: input.email.toLowerCase().trim() }),
        ...(input.role !== undefined && { role: input.role }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.companyId !== undefined && { companyId: input.companyId }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        updatedAt: true,
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return updated;
  },

  /**
   * Delete user (soft delete)
   */
  async deleteUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError(404, "User not found");
    }

    // Prevent deleting Super Admin users
    if (user.isSuperAdmin) {
      throw new AppError(403, "Cannot delete Super Admin user");
    }

    // Delete upgrade requests for the user's company if they have one
    await prisma.$transaction(async (tx) => {
      if (user.companyId) {
        // Delete upgrade requests
        await tx.upgradeRequest.deleteMany({
          where: { companyId: user.companyId },
        });
      }

      // Soft delete user and set isActive to false
      await tx.user.update({
        where: { id: userId },
        data: {
          deletedAt: new Date(),
          isActive: false,
        },
      });

      // Check if there are any active users left in the company
      if (user.companyId) {
        const activeUsersCount = await tx.user.count({
          where: {
            companyId: user.companyId,
            deletedAt: null,
            isActive: true,
          },
        });

        // If no active users remain, deactivate the company
        if (activeUsersCount === 0) {
          await tx.company.update({
            where: { id: user.companyId },
            data: {
              isActive: false,
            },
          });
        }
      }
    });
  },

  /**
   * Activate user
   */
  async activateUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError(404, "User not found");
    }

    if (user.isSuperAdmin) {
      throw new AppError(403, "Cannot modify Super Admin user");
    }

    // Use transaction to ensure atomicity and enforce limits
    const updated = await prisma.$transaction(async (tx) => {
      // Enforce free plan agent limit before activation
      // Only check for AGENT role users on free plan
      if (user.role === Role.AGENT && user.companyId) {
        await enforceFreePlanAgentLimit(user.companyId, tx, userId);
      }

      // Activate user
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { isActive: true },
        select: {
          id: true,
          email: true,
          isActive: true,
        },
      });

      return updatedUser;
    }, {
      maxWait: 5000,
      timeout: 10000,
    });

    return updated;
  },

  /**
   * Deactivate user
   */
  async deactivateUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError(404, "User not found");
    }

    if (user.isSuperAdmin) {
      throw new AppError(403, "Cannot modify Super Admin user");
    }

    // Use transaction to ensure atomicity
    const updated = await prisma.$transaction(async (tx) => {
      // Deactivate user
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { isActive: false },
        select: {
          id: true,
          email: true,
          isActive: true,
        },
      });

      // Revoke all refresh tokens for this user
      await tx.refreshToken.updateMany({
        where: {
          userId,
          revokedAt: null, // Only revoke tokens that aren't already revoked
        },
        data: {
          revokedAt: new Date(),
        },
      });

      return updatedUser;
    });

    return updated;
  },

  /**
   * Reset user password (Super Admin can reset any user's password)
   */
  async resetPassword(userId: string, newPassword: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError(404, "User not found");
    }

    if (user.isSuperAdmin) {
      throw new AppError(403, "Cannot reset Super Admin password");
    }

    // Password strength validation is handled by middleware

    const hashedPassword = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
  },
};

