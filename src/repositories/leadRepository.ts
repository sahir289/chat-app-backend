import prisma from "../lib/prisma";
import type { Lead, LeadSource, LeadStatus, Prisma } from "@prisma/client";

export type LeadSessionSummary = {
  id: string;
  fullName: string;
  chat: {
    sessionId: string;
    propertyId: string;
  } | null;
};

export function readLeadUserId(lead: object): string | null {
  const userId = (lead as { userId?: unknown }).userId;
  return typeof userId === "string" ? userId : null;
}

export const leadRepository = {
  async create(data: {
    companyId: string;
    chatId?: string | null;
    propertyId: string;
    fullName: string;
    email?: string | null;
    userId?: string | null;
    phone?: string | null;
    companyName?: string | null;
    notes?: string | null;
    status?: LeadStatus;
    source?: LeadSource;
    channel?: string | null;
    visitorId?: string | null;
  }): Promise<Lead> {
    return prisma.lead.create({
      data: {
        companyId: data.companyId,
        chatId: data.chatId ?? null,
        propertyId: data.propertyId,
        fullName: data.fullName,
        email: data.email ?? null,
        userId: data.userId ?? null,
        phone: data.phone ?? null,
        companyName: data.companyName ?? null,
        notes: data.notes ?? null,
        status: data.status ?? "NEW",
        source: data.source ?? "WEBSITE",
        channel: data.channel ?? "web_widget",
        visitorId: data.visitorId ?? null,
      } as Prisma.LeadUncheckedCreateInput,
    });
  },

  async findByChatId(chatId: string, companyId?: string): Promise<Lead | null> {
    return prisma.lead.findFirst({
      where: {
        chatId,
        ...(companyId ? { companyId } : {}),
        property: { deletedAt: null },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async findLatestByChatSession(params: {
    companyId: string;
    propertyId: string;
    sessionId: string;
  }): Promise<Lead | null> {
    return prisma.lead.findFirst({
      where: {
        companyId: params.companyId,
        propertyId: params.propertyId,
        property: { deletedAt: null },
        chat: {
          companyId: params.companyId,
          propertyId: params.propertyId,
          sessionId: params.sessionId,
          deletedAt: null,
        },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async findLatestByChatSessions(params: {
    companyId: string;
    sessionIds: string[];
    propertyIds?: string[];
  }): Promise<LeadSessionSummary[]> {
    const sessionIds = [...new Set(params.sessionIds.filter(Boolean))];
    const propertyIds = params.propertyIds
      ? [...new Set(params.propertyIds.filter(Boolean))]
      : undefined;

    if (sessionIds.length === 0) {
      return [];
    }

    return prisma.lead.findMany({
      where: {
        companyId: params.companyId,
        property: { deletedAt: null },
        ...(propertyIds && propertyIds.length > 0 ? { propertyId: { in: propertyIds } } : {}),
        chat: {
          companyId: params.companyId,
          sessionId: { in: sessionIds },
          deletedAt: null,
          ...(propertyIds && propertyIds.length > 0 ? { propertyId: { in: propertyIds } } : {}),
        },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fullName: true,
        chat: {
          select: {
            sessionId: true,
            propertyId: true,
          },
        },
      },
    });
  },

  async findById(id: string, companyId: string): Promise<Lead | null> {
    return prisma.lead.findFirst({
      where: { id, companyId, property: { deletedAt: null } },
    });
  },

  async count(where: Prisma.LeadWhereInput): Promise<number> {
    return prisma.lead.count({ where });
  },

  async findByPropertyId(propertyId: string, companyId?: string): Promise<Lead[]> {
    return prisma.lead.findMany({
      where: {
        propertyId,
        ...(companyId ? { companyId } : {}),
        property: { deletedAt: null },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async countByPropertyIdAndDateRange(
    propertyId: string,
    companyId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<number> {
    return prisma.lead.count({
      where: {
        propertyId,
        ...(companyId ? { companyId } : {}),
        property: { deletedAt: null },
        ...(startDate || endDate
          ? {
            createdAt: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lt: endDate } : {}),
            },
          }
          : {}),
      },
    });
  },

  async findByCompanyId(companyId: string, limit?: number): Promise<Lead[]> {
    return prisma.lead.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      ...(limit !== undefined && { take: limit }),
    });
  },

  async findByCompanyIdWithPropertyFilter(
    companyId: string,
    propertyIds: string[],
    skip: number,
    take: number,
    where?: Prisma.LeadWhereInput
  ): Promise<Lead[]> {
    return prisma.lead.findMany({
      where: {
        companyId,
        propertyId: { in: propertyIds },
        property: { deletedAt: null },
        ...where,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        property: {
          select: {
            id: true,
            name: true,
            domain: true,
          },
        },
      },
    });
  },

  async countByCompanyIdWithPropertyFilter(
    companyId: string,
    propertyIds: string[],
    where?: Prisma.LeadWhereInput
  ): Promise<number> {
    return prisma.lead.count({
      where: {
        companyId,
        propertyId: { in: propertyIds },
        property: { deletedAt: null },
        ...where,
      },
    });
  },

  async findByEmail(email: string): Promise<Lead | null> {
    return prisma.lead.findFirst({
      where: { email },
      orderBy: { createdAt: "desc" },
    });
  },

  async listAll(): Promise<Lead[]> {
    return prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        chat: {
          select: {
            sessionId: true,
            status: true,
          },
        },
        property: {
          select: {
            name: true,
            domain: true,
          },
        },
      },
    });
  },

  async findManyWithPagination(
    where: Prisma.LeadWhereInput,
    skip: number,
    take: number
  ): Promise<Lead[]> {
    return prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        property: {
          select: {
            id: true,
            name: true,
            domain: true,
          },
        },
      },
    });
  },

  async findManyWithFilters(
    where: Prisma.LeadWhereInput,
    skip: number,
    take: number
  ): Promise<Lead[]> {
    return prisma.lead.findMany({
      where: {
        ...where,
        property: { deletedAt: null },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        property: {
          select: {
            id: true,
            name: true,
            domain: true,
          },
        },
      },
    });
  },

  async countWithFilters(where: Prisma.LeadWhereInput): Promise<number> {
    return prisma.lead.count({
      where: {
        ...where,
        property: { deletedAt: null },
      },
    });
  },

  async findManyForExport(where: Prisma.LeadWhereInput, includeCompany: boolean = false): Promise<Array<Lead & {
    property: {
      id: string;
      name: string;
      domain: string | null;
    } | null;
    company?: {
      id: string;
      name: string;
      logo: string | null;
    } | null;
  }>> {
    return prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        property: {
          select: {
            id: true,
            name: true,
            domain: true,
          },
        },
        ...(includeCompany ? {
          company: {
            select: {
              id: true,
              name: true,
              logo: true,
            },
          },
        } : {}),
      },
    });
  },
};

