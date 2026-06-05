import prisma from "../lib/prisma";
import type { Visitor, Prisma } from "@prisma/client";

export const visitorRepository = {
  async findBySessionId(sessionId: string, companyId: string): Promise<Visitor | null> {
    return prisma.visitor.findFirst({
      where: {
        companyId,
        sessionId,
        deletedAt: null,
      },
    });
  },

  async createOrUpdate(params: {
    companyId: string;
    sessionId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    device?: string | null;
    browser?: string | null;
    country?: string | null;
  }): Promise<Visitor> {
    const existing = await this.findBySessionId(params.sessionId, params.companyId);

    if (existing) {
      // Update lastSeen and other fields
      return prisma.visitor.update({
        where: { id: existing.id },
        data: {
          lastSeen: new Date(),
          ipAddress: params.ipAddress ?? existing.ipAddress,
          userAgent: params.userAgent ?? existing.userAgent,
          device: params.device ?? existing.device,
          browser: params.browser ?? existing.browser,
          country: params.country ?? existing.country,
        },
      });
    }

    // Create new visitor
    return prisma.visitor.create({
      data: {
        companyId: params.companyId,
        sessionId: params.sessionId,
        visitorToken: params.sessionId,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
        device: params.device ?? null,
        browser: params.browser ?? null,
        country: params.country ?? null,
        firstSeen: new Date(),
        lastSeen: new Date(),
      },
    });
  },

  async findById(id: string): Promise<Visitor | null> {
    return prisma.visitor.findUnique({
      where: { id },
    });
  },

  async findRecentByCompany(
    companyId: string,
    limit: number = 20,
    propertyIds?: string[]
  ): Promise<Visitor[]> {
    return prisma.visitor.findMany({
      where: {
        companyId,
        deletedAt: null,
        ...(propertyIds && propertyIds.length > 0
          ? {
              chats: {
                some: {
                  propertyId: { in: propertyIds },
                  deletedAt: null,
                },
              },
            }
          : {}),
      },
      orderBy: { lastSeen: "desc" },
      take: limit,
      include: {
        chats: {
          select: { id: true, status: true, createdAt: true, propertyId: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
  },

  /**
   * Find visitors with filters and pagination
   * Supports filtering by propertyId through chats relationship
   */
  async findManyWithFilters(
    where: Prisma.VisitorWhereInput,
    skip: number,
    take: number
  ): Promise<(Visitor & {
    chats: Array<{
      id: string;
      status: string;
      createdAt: Date;
      propertyId: string;
    }>;
  })[]> {
    return prisma.visitor.findMany({
      where,
      orderBy: { lastSeen: "desc" },
      skip,
      take,
      include: {
        chats: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            propertyId: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  },

  /**
   * Count visitors with filters
   */
  async countWithFilters(where: Prisma.VisitorWhereInput): Promise<number> {
    return prisma.visitor.count({ where });
  },
};

