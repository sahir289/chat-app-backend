import { Router } from "express";

import { postWebsiteAnalyticsTrackHandler } from "../controllers/websiteAnalyticsTrackController";
import { asyncHandler } from "../middlewares/asyncHandler";
import {
    websiteAnalyticsTrackIpRateLimit,
    websiteAnalyticsTrackVisitorRateLimit,
} from "../middlewares/rateLimitMiddleware";

const router = Router();

router.post(
    "/track",
    websiteAnalyticsTrackIpRateLimit,
    websiteAnalyticsTrackVisitorRateLimit,
    asyncHandler(postWebsiteAnalyticsTrackHandler)
);

export default router;
