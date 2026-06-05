import { leadRepository } from "../repositories/leadRepository";
import { AppError } from "../utils/appError";
import type { Prisma } from "@prisma/client";

export const superAdminLeadService = {
  async getAllLeads(
    page: number = 1,
    limit: number = 10,
    companyId?: string,
    propertyId?: string,
    startDate?: string,
    endDate?: string
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.LeadWhereInput = {};
    if (companyId) {
      where.companyId = companyId;
    }
    if (propertyId) {
      where.propertyId = propertyId;
    }
    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate
          ? { lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)) }
          : {}),
      };
    }

    const [leads, total] = await Promise.all([
      leadRepository.findManyWithPagination(where, skip, limit),
      leadRepository.count(where),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: leads,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        showing: leads.length,
      },
    };
  },
};

