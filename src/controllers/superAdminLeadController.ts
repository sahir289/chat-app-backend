import type { Request, Response } from "express";
import { superAdminLeadService } from "../services/superAdminLeadService";
import { successResponse } from "../utils/apiResponse";

/**
 * Get all leads across all companies (Super Admin only)
 * GET /api/super-admin/leads
 */
export async function getAllLeadsHandler(
    req: Request,
    res: Response
) {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const companyId = req.query.companyId as string | undefined;
        const propertyId = req.query.propertyId as string | undefined;
        const startDate = req.query.startDate as string | undefined;
        const endDate = req.query.endDate as string | undefined;

        const result = await superAdminLeadService.getAllLeads(
            page,
            limit,
            companyId,
            propertyId,
            startDate,
            endDate
        );

        return successResponse(res, { data: result, statusCode: 200 });
    }

