import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { authMiddleware, tenantMiddleware } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validationMiddleware";
import { requireCompany } from "../middlewares/requireCompanyMiddleware";
import { requirePropertyScopeQuery } from "../middlewares/propertyScopeMiddleware";
import { parseDashboardDateRange } from "../middlewares/dashboardDateRangeMiddleware";
import {
    getDashboardOverviewHandler,
    getDashboardChatsHandler,
} from "../controllers/dashboardController";
import { dashboardChatsQuerySchema, dashboardOverviewQuerySchema } from "../validations/dashboardValidation";

const router = Router();

// GET /api/dashboard/overview?propertyId=...
router.get(
  "/overview",
  authMiddleware,
  tenantMiddleware,
  requireCompany,
  validate(dashboardOverviewQuerySchema),
  requirePropertyScopeQuery("propertyId"),
  parseDashboardDateRange,
  asyncHandler(getDashboardOverviewHandler)
);

// GET /api/dashboard/chats?propertyId=...
router.get(
  "/chats",
  authMiddleware,
  tenantMiddleware,
  requireCompany,
  validate(dashboardChatsQuerySchema),
  requirePropertyScopeQuery("propertyId"),
  asyncHandler(getDashboardChatsHandler)
);

export default router;


