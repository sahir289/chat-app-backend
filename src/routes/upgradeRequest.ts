import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { authMiddleware, tenantMiddleware } from "../middlewares/authMiddleware";
import { requireModule } from "../middlewares/moduleAccessMiddleware";
import { companySuspensionMiddleware } from "../middlewares/companySuspensionMiddleware";
import { superAdminOnly, adminOnly } from "../middlewares/roleMiddleware";
import { validate } from "../middlewares/validationMiddleware";
import { createUpgradeRequestSchema } from "../validations/upgradeRequestValidation";
import {
  createUpgradeRequestHandler,
  getUpgradeRequestHandler,
  getMyUpgradeRequestsHandler,
  listAllUpgradeRequestsHandler,
  approveUpgradeRequestHandler,
  rejectUpgradeRequestHandler,
  updateUpgradeRequestStatusHandler,
} from "../controllers/upgradeRequestController";

const router = Router();

router.get(
  "/my",
  authMiddleware,
  tenantMiddleware,
  requireModule("company"),
  companySuspensionMiddleware,
  asyncHandler(getMyUpgradeRequestsHandler)
);

router.post("/", 
  authMiddleware, 
  tenantMiddleware, 
  adminOnly, 
  validate(createUpgradeRequestSchema), 
  asyncHandler(createUpgradeRequestHandler));

router.get("/:id", 
  authMiddleware, 
  tenantMiddleware, 
  adminOnly, 
  asyncHandler(getUpgradeRequestHandler));

router.get("/admin/all", 
  authMiddleware, 
  superAdminOnly, 
  asyncHandler(listAllUpgradeRequestsHandler));

router.post("/admin/:id/approve", 
  authMiddleware, 
  superAdminOnly, 
  asyncHandler(approveUpgradeRequestHandler));

router.post("/admin/:id/reject", 
  authMiddleware, 
  superAdminOnly, 
  asyncHandler(rejectUpgradeRequestHandler));

router.patch("/admin/:id/status", 
  authMiddleware, 
  superAdminOnly, 
  asyncHandler(updateUpgradeRequestStatusHandler));

export default router;

