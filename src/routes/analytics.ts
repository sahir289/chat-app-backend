import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { authMiddleware, tenantMiddleware } from "../middlewares/authMiddleware";
import { requireModule } from "../middlewares/moduleAccessMiddleware";
import {
    getAnalyticsOverviewHandler,
    getPropertiesHandler,
    getRecentVisitorsHandler,
} from "../controllers/analyticsController";

const router = Router();

router.get("/overview", 
    authMiddleware, 
    tenantMiddleware,
    requireModule("analytics"),
    asyncHandler(getAnalyticsOverviewHandler));

router.get("/properties", 
    authMiddleware, 
    tenantMiddleware, 
    requireModule("analytics"), 
    asyncHandler(getPropertiesHandler));

router.get("/recent-visitors", 
    authMiddleware, 
    tenantMiddleware, 
    requireModule("analytics"), 
    asyncHandler(getRecentVisitorsHandler));

export default router;

