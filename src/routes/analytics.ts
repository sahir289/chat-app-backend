import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { authMiddleware, tenantMiddleware } from "../middlewares/authMiddleware";
import { requireCompany } from "../middlewares/requireCompanyMiddleware";
import { validate } from "../middlewares/validationMiddleware";
import { requirePropertyScopeQuery } from "../middlewares/propertyScopeMiddleware";
import { parseAnalyticsDateRange } from "../middlewares/analyticsDateRangeMiddleware";
import { requireModule } from "../middlewares/moduleAccessMiddleware";
import {
    getAnalyticsOverviewHandler,
    getPropertiesHandler,
    getRecentVisitorsHandler,
} from "../controllers/analyticsController";
import {
    analyticsOverviewQuerySchema,
    analyticsRecentVisitorsQuerySchema,
} from "../validations/analyticsValidation";

const router = Router();

router.get(
    "/overview",
    authMiddleware,
    tenantMiddleware,
    requireCompany,
    requireModule("analytics"),
    validate(analyticsOverviewQuerySchema),
    requirePropertyScopeQuery("propertyId"),
    parseAnalyticsDateRange,
    asyncHandler(getAnalyticsOverviewHandler)
);

router.get(
    "/properties",
    authMiddleware,
    tenantMiddleware,
    requireCompany,
    requireModule("analytics"),
    asyncHandler(getPropertiesHandler)
);

router.get(
    "/recent-visitors",
    authMiddleware,
    tenantMiddleware,
    requireCompany,
    requireModule("analytics"),
    validate(analyticsRecentVisitorsQuerySchema),
    asyncHandler(getRecentVisitorsHandler)
);

export default router;
