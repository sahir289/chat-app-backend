import type { AuditAction, Prisma, ResourceType } from "@prisma/client";
import prisma from "../lib/prisma";
import { getModuleLogger } from "../utils/logger";

const log = getModuleLogger("securityAudit");

export async function writeSecurityAuditLog(params: {
    companyId?: string | null;
    userId?: string | null;
    action: AuditAction;
    resourceType: ResourceType;
    resourceId?: string | null;
    metadata?: Prisma.InputJsonValue;
    ipAddress?: string | null;
    userAgent?: string | null;
}): Promise<void> {
    try {
        await prisma.auditLog.create({
            data: {
                companyId: params.companyId ?? undefined,
                userId: params.userId ?? undefined,
                action: params.action,
                resourceType: params.resourceType,
                resourceId: params.resourceId ?? undefined,
                metadata: params.metadata ?? undefined,
                ipAddress: params.ipAddress ?? undefined,
                userAgent: params.userAgent ?? undefined,
            },
        });
    } catch (err) {
        log.warn("audit log write failed", err);
    }
}
