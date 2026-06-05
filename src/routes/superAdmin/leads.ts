import { Router } from "express";
import { asyncHandler } from "../../middlewares/asyncHandler";
import { authMiddleware } from "../../middlewares/authMiddleware";
import { superAdminOnly } from "../../middlewares/roleMiddleware";
import { getAllLeadsHandler } from "../../controllers/superAdminLeadController";
import { exportSuperAdminLeadsHandler } from "../../controllers/superAdminLeadExportController";

const router = Router();

router.get("/export", authMiddleware, superAdminOnly, asyncHandler(exportSuperAdminLeadsHandler));

router.get("/", authMiddleware, superAdminOnly, asyncHandler(getAllLeadsHandler));

export default router;
