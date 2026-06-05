import { Router } from "express";
import { asyncHandler } from "../../middlewares/asyncHandler";
import { authMiddleware } from "../../middlewares/authMiddleware";
import { superAdminOnly } from "../../middlewares/roleMiddleware";
import { getPlatformStatsHandler } from "../../controllers/superAdminStatsController";

const router = Router();

router.get("/", authMiddleware, superAdminOnly, asyncHandler(getPlatformStatsHandler));

export default router;
