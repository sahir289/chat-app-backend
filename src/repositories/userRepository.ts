import prisma from "../lib/prisma";
import type { User, Prisma } from "@prisma/client";
import { Role } from "@prisma/client";

export const userRepository = {

  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  },

  async findByEmail(normalizedEmail: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
  },

  async findByIdWithCompany(id: string): Promise<(User & { company: { id: string; name: string; isPro: boolean } | null }) | null> {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        email: true,
        name: true,
        password: true,
        role: true,
        isOwner: true,
        isActive: true,
        emailVerified: true,
        avatarUrl: true,
        deletedAt: true,
        inviteToken: true,
        inviteExpires: true,
        emailVerificationToken: true,
        emailVerificationExpires: true,
        lastSeen: true,
        timezone: true,
        isSuperAdmin: true,
        createdAt: true,
        updatedAt: true,
        company: {
          select: {
            id: true,
            name: true,
            isPro: true,
          },
        },
      },
    }) as Promise<(User & { company: { id: string; name: string; isPro: boolean } | null }) | null>;
  },

  async listByCompany(
    companyId: string,
    limit?: number,
    offset?: number,
    roleFilter?: Role[]
  ): Promise<{ users: User[]; total: number }> {
    const where: Prisma.UserWhereInput = {
      companyId,
      deletedAt: null,
      ...(roleFilter && roleFilter.length > 0 ? { role: { in: roleFilter } } : {}),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...(limit !== undefined && { take: limit }),
        ...(offset !== undefined && { skip: offset }),
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total };
  },

  async count(where?: Prisma.UserWhereInput): Promise<number> {
    if (where) {
      return prisma.user.count({ where });
    }
    return prisma.user.count();
  },

  async countByCompany(companyId: string): Promise<number> {
    return prisma.user.count({
      where: { companyId },
    });
  },

  async create(data: {
    companyId: string | null;
    email: string;
    name: string | null;
    password: string;
    role: Role;
    isOwner: boolean;
    isActive: boolean;
    emailVerified: boolean;
    emailVerificationToken?: string | null;
    emailVerificationExpires?: Date | null;
    inviteToken?: string | null;
    inviteExpires?: Date | null;
    isSuperAdmin?: boolean;
  }): Promise<User> {
    return prisma.user.create({
      data: {
        ...data,
        role: data.role as Role,
      },
    });
  },

  async update(
    id: string,
    data: {
      name?: string | null;
      email?: string | null;
      password?: string | null;
      role?: Role;
      isOwner?: boolean;
      isActive?: boolean;
      emailVerified?: boolean;
      avatarUrl?: string | null;
      emailVerificationToken?: string | null;
      emailVerificationExpires?: Date | null;
      passwordResetToken?: string | null;
      passwordResetExpires?: Date | null;
      inviteToken?: string | null;
      inviteExpires?: Date | null;
      deletedAt?: Date | null;
      twoFactorEnabled?: boolean;
      twoFactorSecret?: string | null;
      twoFactorBackupCodes?: string[];
    }
  ): Promise<User> {
    const updateData: Prisma.UserUpdateInput & {
      twoFactorEnabled?: boolean;
      twoFactorSecret?: string | null;
      twoFactorBackupCodes?: string[];
    } = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined && data.email !== null) updateData.email = data.email;
    if (data.password !== undefined) updateData.password = data.password;
    
    if (data.role !== undefined) updateData.role = data.role;
    if (data.isOwner !== undefined) updateData.isOwner = data.isOwner;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.emailVerified !== undefined) updateData.emailVerified = data.emailVerified;
    
    if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl;

    if (data.emailVerificationToken !== undefined) updateData.emailVerificationToken = data.emailVerificationToken;
    if (data.emailVerificationExpires !== undefined) updateData.emailVerificationExpires = data.emailVerificationExpires;

    if (data.passwordResetToken !== undefined) updateData.passwordResetToken = data.passwordResetToken;
    if (data.passwordResetExpires !== undefined) updateData.passwordResetExpires = data.passwordResetExpires;

    if (data.inviteToken !== undefined) updateData.inviteToken = data.inviteToken;
    if (data.inviteExpires !== undefined) updateData.inviteExpires = data.inviteExpires;

    if (data.deletedAt !== undefined) updateData.deletedAt = data.deletedAt;
    
    if (data.twoFactorEnabled !== undefined) updateData.twoFactorEnabled = data.twoFactorEnabled;
    if (data.twoFactorSecret !== undefined) updateData.twoFactorSecret = data.twoFactorSecret;
    if (data.twoFactorBackupCodes !== undefined) updateData.twoFactorBackupCodes = data.twoFactorBackupCodes;

    return prisma.user.update({
      where: { id },
      data: updateData as Prisma.UserUpdateInput,
    });
  },

  async updateByCompanyId(
    id: string,
    companyId: string,
    data: {
      name?: string | null;
      email?: string | null;
      password?: string | null;
      role?: Role;
      isOwner?: boolean;
      isActive?: boolean;
      emailVerified?: boolean;
      avatarUrl?: string | null;
      emailVerificationToken?: string | null;
      emailVerificationExpires?: Date | null;
      passwordResetToken?: string | null;
      passwordResetExpires?: Date | null;
      inviteToken?: string | null;
      inviteExpires?: Date | null;
      deletedAt?: Date | null;
    }
  ): Promise<User> {
    const updateData: Prisma.UserUpdateInput = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined && data.email !== null) updateData.email = data.email;
    if (data.password !== undefined) updateData.password = data.password;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.isOwner !== undefined) updateData.isOwner = data.isOwner;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.emailVerified !== undefined) updateData.emailVerified = data.emailVerified;
    if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl;
    if (data.emailVerificationToken !== undefined) updateData.emailVerificationToken = data.emailVerificationToken;
    if (data.emailVerificationExpires !== undefined) updateData.emailVerificationExpires = data.emailVerificationExpires;
    if (data.passwordResetToken !== undefined) updateData.passwordResetToken = data.passwordResetToken;
    if (data.passwordResetExpires !== undefined) updateData.passwordResetExpires = data.passwordResetExpires;
    if (data.inviteToken !== undefined) updateData.inviteToken = data.inviteToken;
    if (data.inviteExpires !== undefined) updateData.inviteExpires = data.inviteExpires;
    if (data.deletedAt !== undefined) updateData.deletedAt = data.deletedAt;

    return prisma.user.update({
      where: { id, companyId },
      data: updateData,
    });
  },

  async findFirstByInviteToken(hashedToken: string): Promise<User | null> {
    return prisma.user.findFirst({
      where: {
        inviteToken: hashedToken,
        inviteExpires: { gt: new Date() },
        isActive: false,
        role: Role.AGENT,
      },
    });
  },

  async findManyWithVerificationTokens(): Promise<Array<User & { company: { id: string; name: string; isPro: boolean } | null }>> {
    return prisma.user.findMany({
      where: {
        emailVerificationToken: { not: null },
        emailVerificationExpires: { gte: new Date() },
        emailVerified: false,
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            isPro: true,
          },
        },
      },
    }) as Promise<Array<User & { company: { id: string; name: string; isPro: boolean } | null }>>;
  },

  async findManyWithExpiredVerificationTokens(): Promise<User[]> {
    return prisma.user.findMany({
      where: {
        emailVerificationToken: { not: null },
        emailVerificationExpires: { lt: new Date() },
        emailVerified: false,
      },
    });
  },

  async findManyWithPasswordResetTokens(): Promise<User[]> {
    return prisma.user.findMany({
      where: {
        passwordResetToken: { not: null },
        passwordResetExpires: { gte: new Date() },
      },
    });
  },

  async findFirstByVerificationToken(hashedToken: string): Promise<(User & { company: { id: string; name: string; isPro: boolean } | null }) | null> {
    return prisma.user.findFirst({
      where: {
        emailVerificationToken: hashedToken,
        emailVerificationExpires: { gte: new Date() },
        emailVerified: false,
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            isPro: true,
          },
        },
      },
    }) as Promise<(User & { company: { id: string; name: string; isPro: boolean } | null }) | null>;
  },

  async findFirstByExpiredVerificationToken(hashedToken: string): Promise<User | null> {
    return prisma.user.findFirst({
      where: {
        emailVerificationToken: hashedToken,
        emailVerificationExpires: { lt: new Date() },
        emailVerified: false,
      },
    });
  },

  async findFirstByPasswordResetToken(hashedToken: string): Promise<User | null> {
    return prisma.user.findFirst({
      where: {
        passwordResetToken: hashedToken,
        passwordResetExpires: { gte: new Date() },
        isActive: true,
        deletedAt: null,
      },
    });
  },

  async findFirstCompany(): Promise<{ id: string } | null> {
    const company = await prisma.company.findFirst({
      select: { id: true },
    });
    return company;
  },

  async findSuperAdmins(): Promise<Array<{ email: string }>> {
    return prisma.user.findMany({
      where: {
        isSuperAdmin: true,
        role: Role.SUPER_ADMIN,
        isActive: true,
      },
      select: {
        email: true,
      },
    });
  },

  async findSuperAdminByRole(): Promise<User | null> {
    return prisma.user.findFirst({
      where: {
        role: Role.SUPER_ADMIN,
        isSuperAdmin: true,
      },
    });
  },
};

