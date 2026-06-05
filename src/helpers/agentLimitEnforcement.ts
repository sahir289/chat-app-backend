import prisma from "../lib/prisma";
import { AppError } from "../utils/appError";
import { Role } from "@prisma/client";

export async function enforceFreePlanAgentLimit(
    companyId: string,
    tx?: any,
    excludeUserId?: string
): Promise<void> {
    const client = tx || prisma;

    const company = await client.company.findUnique({
        where: { id: companyId },
        select: { isPro: true },
    });

    if (!company) {
        throw new AppError(404, "Company not found");
    }

    if (company.isPro) {
        return;
    }

    const activeAgentCount = await client.user.count({
        where: {
            companyId,
            role: Role.AGENT,
            isActive: true,
            isOwner: false,
            ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
        },
    });

    if (activeAgentCount >= 2) {
        throw new AppError(
            403,
            "Free plan allows only 2 active agents. Deactivate one to continue."
        );
    }
}

