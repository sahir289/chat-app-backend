import prisma from "../lib/prisma";
import type { UpgradeRequest } from "@prisma/client";

function dedupeByCompanyAndEmail<T extends { companyId: string; email: string }>(
  requests: T[]
): T[] {
  const seen = new Set<string>();

  return requests.filter((request) => {
    const key = `${request.companyId}:${request.email.toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export const upgradeRequestRepository = {
  async create(data: {
    companyId: string;
    name: string;
    companyName: string;
    email: string;
    phone?: string | null;
    message?: string | null;
  }): Promise<UpgradeRequest> {
    return prisma.upgradeRequest.create({
      data: {
        companyId: data.companyId,
        name: data.name,
        companyName: data.companyName,
        email: data.email,
        phone: data.phone,
        message: data.message,
      },
    });
  },

  async findById(id: string): Promise<UpgradeRequest | null> {
    return prisma.upgradeRequest.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            isPro: true,
          },
        },
        processedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  },

  async findByCompanyId(companyId: string): Promise<UpgradeRequest[]> {
    const requests = await prisma.upgradeRequest.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      include: {
        processedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return dedupeByCompanyAndEmail(requests) as UpgradeRequest[];
  },

  async findLatestByCompanyId(companyId: string): Promise<UpgradeRequest | null> {
    return prisma.upgradeRequest.findFirst({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });
  },

  async listAll(status?: string): Promise<UpgradeRequest[]> {
    const requests = await prisma.upgradeRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            isPro: true,
          },
        },
        processedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return dedupeByCompanyAndEmail(requests) as UpgradeRequest[];
  },

  async update(
    id: string,
    data: {
      status?: string;
      notes?: string | null;
      processedById?: string | null;
      processedAt?: Date | null;
    }
  ): Promise<UpgradeRequest> {
    return prisma.upgradeRequest.update({
      where: { id },
      data: {
        status: data.status,
        notes: data.notes,
        processedById: data.processedById,
        processedAt: data.processedAt || (data.processedById ? new Date() : null),
      },
    });
  },

  async deleteByCompanyId(companyId: string): Promise<{ count: number }> {
    return prisma.upgradeRequest.deleteMany({
      where: { companyId },
    });
  },
};

