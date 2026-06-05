import prisma from "../lib/prisma";
import { AppError } from "../utils/appError";
import { Role } from "@prisma/client";
import { authService } from "./authService";
import { sendEmail } from "./emailService";
import { inviteUserTemplate } from "../email/templates/auth/inviteUserTemplate";
import {
  agentAccessService,
  AgentChatAccessScopeInput,
  AgentModuleAccessInput,
} from "./agentAccessService";
import { companyService } from "./companyService";
import { config } from "../config";

const prismaClient = prisma as any;
const userModel = prismaClient.user;
export interface InviteAgentInput {
  email: string;
  name?: string;
  role?: Role;
  moduleAccess?: AgentModuleAccessInput;
  propertyIds?: string[];
  chatAccessScope?: AgentChatAccessScopeInput;
}

export const teamService = {
  async inviteAgent(
    companyId: string,
    email: string,
    name?: string,
    role?: Role,
    moduleAccess?: AgentModuleAccessInput,
    propertyIds?: string[],
    chatAccessScope?: AgentChatAccessScopeInput
  ) {
    if (!userModel) {
      throw new AppError(500, "User model not available. Run prisma generate/migrate.");
    }

    // Only AGENT role allowed for invites
    const agentRole = Role.AGENT;
    if (role && role !== Role.AGENT) {
      throw new AppError(400, "Only AGENT role can be invited");
    }

    // Check company Pro status and agent count limit
    const company = await companyService.getById(companyId);
    const isPro = company.isPro || false;

    // Count active agents (excluding owner) before invite
    const agentCountBefore = await prisma.user.count({
      where: {
        companyId,
        role: Role.AGENT,
        isActive: true,
        isOwner: false,
      },
    });

    // For Free plan, allow 2 agents but show upgrade message after
    if (!isPro && agentCountBefore >= 2) {
      throw new AppError(403, "Upgrade to Pro to add more agents. Free plan allows 2 agents.");
    }

    // Normalize email to lowercase for case-insensitive lookup
    const normalizedEmail = email.toLowerCase().trim();

    const existing = await userModel.findUnique({ where: { email: normalizedEmail } });

    const { raw: inviteToken, hashed: inviteTokenHashed, expiresAt } =
      await authService.createInviteToken();

    if (existing) {
      if (existing.isActive) {
        throw new AppError(400, "User already exists and is active");
      }
      if (existing.companyId !== companyId) {
        throw new AppError(403, "User belongs to a different company");
      }

      await userModel.update({
        where: { email: normalizedEmail },
        data: {
          name: name || existing.name,
          role: agentRole,
          password: null,
          isActive: false,
          inviteToken: inviteTokenHashed,
          inviteExpires: expiresAt,
        },
      });
    } else {
      await userModel.create({
        data: {
          companyId,
          email: normalizedEmail,
          name: name || normalizedEmail.split("@")[0],
          role: agentRole,
          password: null,
          isOwner: false,
          isActive: false,
          inviteToken: inviteTokenHashed,
          inviteExpires: expiresAt,
        },
      });
    }

    const inviteLink = `${config.urls.inviteBaseUrl.replace(/\/$/, "")}/accept-invite?token=${inviteToken}`;
    const template = inviteUserTemplate({
      name: name || normalizedEmail.split("@")[0],
      inviteLink,
    });
    await sendEmail({
      to: normalizedEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    // Get the created/updated user ID
    const user = await userModel.findUnique({ where: { email: normalizedEmail } });

    // Count all agents (active and pending) after invite for Free plan check
    const totalAgentCountAfter = await prisma.user.count({
      where: {
        companyId,
        role: Role.AGENT,
        isOwner: false,
      },
    });

    // Count active agents for access control
    const activeAgentCountAfter = await prisma.user.count({
      where: {
        companyId,
        role: Role.AGENT,
        isActive: true,
        isOwner: false,
      },
    });

    // Set agent access control (for PRO companies OR Free plan with up to 2 active agents)
    if (user && (company.isPro || (!company.isPro && activeAgentCountAfter <= 2))) {
      if (moduleAccess) {
        await agentAccessService.setAgentModuleAccess(user.id, companyId, moduleAccess);
      }

      if (propertyIds && propertyIds.length > 0) {
        await agentAccessService.setAgentPropertyAccess(user.id, companyId, propertyIds);
      }

      if (chatAccessScope) {
        await agentAccessService.setAgentChatAccessScope(
          user.id,
          companyId,
          chatAccessScope
        );
      }
    }

    // Return upgrade flag for Free plan after inviting 2 agents (count all agents, active or pending)
    const shouldShowUpgrade = !company.isPro && totalAgentCountAfter >= 2;

    return {
      email: normalizedEmail,
      inviteExpires: expiresAt,
      shouldShowUpgrade
    };
  },

  async deactivateAgent(companyId: string, userId: string) {
    if (!userModel) {
      throw new AppError(500, "User model not available. Run prisma generate/migrate.");
    }

    const user = await userModel.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError(404, "User not found");
    }
    if (user.companyId !== companyId) {
      throw new AppError(403, "User belongs to a different company");
    }
    if (user.role !== Role.AGENT) {
      throw new AppError(400, "Only agents can be deactivated");
    }
    if (user.isOwner) {
      throw new AppError(400, "Owner cannot be deactivated");
    }

    // Use transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      // Deactivate user
      await tx.user.update({
        where: { id: userId },
        data: {
          isActive: false,
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
    });
  },
};

