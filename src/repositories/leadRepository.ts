import prisma from "../lib/prisma";
import type { Lead, LeadSource, LeadStatus, Prisma } from "@prisma/client";

export const leadRepository = {
  async create(data: {
    companyId: string;
    chatId?: string | null;
    propertyId: string;
    fullName: string;
    email: string;
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
        email: data.email,
        phone: data.phone ?? null,
        companyName: data.companyName ?? null,
        notes: data.notes ?? null,
        status: data.status ?? "NEW",
        source: data.source ?? "WEBSITE",
        channel: data.channel ?? "web_widget",
        visitorId: data.visitorId ?? null,
      },
    });
  },

  async findByChatId(chatId: string, companyId?: string): Promise<Lead | null> {
    return prisma.lead.findFirst({
      where: {
        chatId,
        ...(companyId ? { companyId } : {}),
      },
    });
  },

  async findById(id: string, companyId: string): Promise<Lead | null> {
    return prisma.lead.findFirst({
      where: { id, companyId },
    });
  },

  async count(where: Prisma.LeadWhereInput): Promise<number> {
    return prisma.lead.count({ where });
  },

  async findByPropertyId(propertyId: string, companyId?: string): Promise<Lead[]> {
    return prisma.lead.findMany({
      where: { propertyId, ...(companyId ? { companyId } : {}) },
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
      where,
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
    return prisma.lead.count({ where });
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

