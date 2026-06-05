import { upgradeRequestRepository } from "../repositories/upgradeRequestRepository";
import { AppError } from "../utils/appError";
import prisma from "../lib/prisma";
import { sendEmail } from "./emailService";
import { proRequestThankYouTemplate } from "../email/templates/billing/proRequestThankYouTemplate";
import { proRequestNotificationTemplate } from "../email/templates/billing/proRequestNotificationTemplate";
import { proApprovalTemplate } from "../email/templates/billing/proApprovalTemplate";
import { moduleControlService } from "./moduleControlService";
import { companyService } from "./companyService";
import { subscriptionService } from "./subscriptionService";
import { Role } from "@prisma/client";
async function getSuperAdminEmails(): Promise<string[]> {
  const superAdmins = await prisma.user.findMany({
    where: {
      isSuperAdmin: true,
      role: Role.SUPER_ADMIN,
      isActive: true,
    },
    select: {
      email: true,
    },
  });

  return superAdmins.map((admin) => admin.email);
}

export const upgradeRequestService = {
  async createRequest(data: {
    companyId: string;
    name: string;
    companyName: string;
    email: string;
    phone?: string | null;
    message?: string | null;
  }) {
    const normalizedEmail = data.email.trim().toLowerCase();
    const existingOpenRequest = await prisma.upgradeRequest.findFirst({
      where: {
        companyId: data.companyId,
        email: normalizedEmail,
        status: {
          in: ["PENDING", "CONTACTED"],
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
      },
    });

    if (existingOpenRequest) {
      throw new AppError(
        409,
        "An upgrade request already exists for this email. Please update the existing request instead of creating a new one."
      );
    }

    const request = await upgradeRequestRepository.create(data);

    // Send emails asynchronously (don't block the request)
    Promise.all([
      (async () => {
        try {
          const template = proRequestThankYouTemplate({
            name: data.name,
            companyName: data.companyName,
          });
          await sendEmail({
            to: data.email,
            subject: template.subject,
            html: template.html,
            text: template.text,
          });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
        }
      })(),
      getSuperAdminEmails()
        .then(async (emails) => {
          if (emails.length > 0) {
            try {
              const template = proRequestNotificationTemplate({
                requestData: {
                  name: data.name,
                  companyName: data.companyName,
                  email: data.email,
                  phone: data.phone,
                  message: data.message,
                },
              });
              await sendEmail({
                to: emails,
                subject: template.subject,
                html: template.html,
                text: template.text,
              });
            } catch (err) {
              const errorMessage = err instanceof Error ? err.message : String(err);
            }
          }
        })
        .catch((err) => {
          const errorMessage = err instanceof Error ? err.message : String(err);
        }),
    ]).catch((err) => {
      const errorMessage = err instanceof Error ? err.message : String(err);
    });

    return request;
  },

  async getRequestById(id: string) {
    const request = await upgradeRequestRepository.findById(id);
    if (!request) {
      throw new AppError(404, "Upgrade request not found");
    }
    return request;
  },

  async getRequestsByCompany(companyId: string) {
    return upgradeRequestRepository.findByCompanyId(companyId);
  },

  async listAllRequests(status?: string) {
    return upgradeRequestRepository.listAll(status);
  },

  async updateRequestStatus(
    id: string,
    status: string,
    notes?: string | null,
    processedById?: string | null
  ) {
    const request = await upgradeRequestRepository.findById(id);
    if (!request) {
      throw new AppError(404, "Upgrade request not found");
    }

    const normalizedStatus = status.toUpperCase();

    if (normalizedStatus === "APPROVED") {
      // Validate before enabling PRO access
      await companyService.validateProEnablement(request.companyId);
      await prisma.company.update({
        where: { id: request.companyId },
        data: { isPro: true },
      });
      await subscriptionService.syncSubscriptionForCompany(request.companyId, true);

      if (processedById) {
        try {
          await moduleControlService.enableAllModules(
            request.companyId,
            processedById,
            "PRO enabled from upgrade request status update"
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
        }
      }
    } else if (["REJECTED", "PENDING", "CONTACTED"].includes(normalizedStatus)) {
      await prisma.company.update({
        where: { id: request.companyId },
        data: { isPro: false },
      });
      await subscriptionService.syncSubscriptionForCompany(request.companyId, false);

      if (processedById) {
        try {
          await moduleControlService.setFreePlanModules(
            request.companyId,
            processedById,
            `PRO disabled from upgrade request status update (${normalizedStatus})`
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
        }
      }
    }

    return upgradeRequestRepository.update(id, {
      status: normalizedStatus,
      notes,
      processedById,
      processedAt: processedById ? new Date() : null,
    });
  },

  async approveRequest(id: string, processedById: string, notes?: string) {
    const request = await upgradeRequestRepository.findById(id);
    if (!request) {
      throw new AppError(404, "Upgrade request not found");
    }

    // Validate that PRO can be enabled (checks: not suspended, has active users, has active admin)
    await companyService.validateProEnablement(request.companyId);

    // Update company to Pro
    await prisma.company.update({
      where: { id: request.companyId },
      data: { isPro: true },
    });
    await subscriptionService.syncSubscriptionForCompany(request.companyId, true);

    // Enable all modules for PRO companies
    // This ensures that when a company is upgraded to PRO, all modules are accessible
    try {
      await moduleControlService.enableAllModules(
        request.companyId,
        processedById,
        `Auto-enabled on PRO upgrade approval${notes ? `: ${notes}` : ""}`
      );
    } catch (error) {
      // Log error but don't fail the approval if module enabling fails
      const errorMessage = error instanceof Error ? error.message : String(error);
    }

    // Update request status
    const updatedRequest = await upgradeRequestRepository.update(id, {
      status: "APPROVED",
      notes,
      processedById,
      processedAt: new Date(),
    });

    // Send approval email to the user asynchronously (don't block the request)
    (async () => {
      try {
        const template = proApprovalTemplate({
          name: request.name,
          companyName: request.companyName,
        });
        await sendEmail({
          to: request.email,
          subject: template.subject,
          html: template.html,
          text: template.text,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
      }
    })();

    return updatedRequest;
  },

  async rejectRequest(id: string, processedById: string, notes?: string) {
    const request = await upgradeRequestRepository.findById(id);
    if (!request) {
      throw new AppError(404, "Upgrade request not found");
    }

    await prisma.company.update({
      where: { id: request.companyId },
      data: { isPro: false },
    });
    await subscriptionService.syncSubscriptionForCompany(request.companyId, false);

    try {
      await moduleControlService.setFreePlanModules(
        request.companyId,
        processedById,
        "PRO disabled from upgrade request rejection"
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
    }

    return upgradeRequestRepository.update(id, {
      status: "REJECTED",
      notes,
      processedById,
      processedAt: new Date(),
    });
  },
};

