import { aiCreditsAddonRequestRepository } from "../repositories/aiCreditsAddonRequestRepository";
import { aiCreditsService } from "./aiCreditsService";
import { AppError } from "../utils/appError";

export const aiCreditsAddonRequestService = {
    async createRequest(params: {
        companyId: string;
        message?: string | null;
        requestedCredits?: number | null;
    }) {
        // Keep legacy behavior of reading usage (useful for future rules / auditing),
        // but allow addon requests even before the limit is reached.
        await aiCreditsService.getUsage(params.companyId);

        const existing = await aiCreditsAddonRequestRepository.findPendingByCompanyId(
            params.companyId
        );
        if (existing) {
            throw new AppError(
                409,
                "You already have a pending addon credits request. Please wait for the team to respond."
            );
        }

        return aiCreditsAddonRequestRepository.create({
            companyId: params.companyId,
            message: params.message,
            requestedCredits: params.requestedCredits,
        });
    },

    async listForCompany(companyId: string) {
        return aiCreditsAddonRequestRepository.listByCompanyId(companyId);
    },

    async listAllForAdmin(status?: string) {
        return aiCreditsAddonRequestRepository.listAll(status);
    },

    async updateRequestStatus(params: {
        requestId: string;
        superAdminUserId: string;
        status: "FULFILLED" | "REJECTED";
        notes?: string | null;
    }) {
        const existing = await aiCreditsAddonRequestRepository.findById(params.requestId);
        if (!existing) {
            throw new AppError(404, "Addon credits request not found");
        }
        if (existing.status !== "PENDING") {
            throw new AppError(400, "This request has already been processed");
        }

        return aiCreditsAddonRequestRepository.updateStatus(params.requestId, {
            status: params.status,
            notes: params.notes,
            processedById: params.superAdminUserId,
        });
    },
};
