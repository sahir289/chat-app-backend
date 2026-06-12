import { Router } from "express";
import { asyncHandler } from "../../middlewares/asyncHandler";
import { authMiddleware } from "../../middlewares/authMiddleware";
import { superAdminOnly } from "../../middlewares/roleMiddleware";
import { validate } from "../../middlewares/validationMiddleware";
import {
    websiteAnalyticsDecryptIpQuerySchema,
    websiteAnalyticsVisitorIdParamSchema,
} from "../../validations/websiteAnalyticsValidation";
import {
    getWebsiteAnalyticsDecryptIpHandler,
    getWebsiteAnalyticsOverviewHandler,
    getWebsiteAnalyticsPageViewsHandler,
    getWebsiteAnalyticsTopPagesHandler,
    getWebsiteAnalyticsVisitorDetailHandler,
    getWebsiteAnalyticsVisitorsHandler,
} from "../../controllers/superAdminWebsiteAnalyticsController";

const router = Router();

router.get("/overview",
    authMiddleware,
    superAdminOnly,
    asyncHandler(getWebsiteAnalyticsOverviewHandler));

router.get("/visitors",
    authMiddleware,
    superAdminOnly,
    asyncHandler(getWebsiteAnalyticsVisitorsHandler));

router.get(
    "/visitors/:visitorId",
    authMiddleware,
    superAdminOnly,
    validate(websiteAnalyticsVisitorIdParamSchema),
    asyncHandler(getWebsiteAnalyticsVisitorDetailHandler)
);

router.get("/top-pages",
    authMiddleware,
    superAdminOnly,
    asyncHandler(getWebsiteAnalyticsTopPagesHandler));

router.get("/page-views",
    authMiddleware,
    superAdminOnly,
    asyncHandler(getWebsiteAnalyticsPageViewsHandler));

router.get("/decrypt-ip",
    authMiddleware,
    superAdminOnly,
    validate(websiteAnalyticsDecryptIpQuerySchema),
    asyncHandler(getWebsiteAnalyticsDecryptIpHandler));

export default router;
