import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import {
  createLeadHandler,
  createManualLeadHandler,
  importLeadsCsvHandler,
  listLeadsHandler,
  getLeadHandler,
} from "../controllers/leadController";
import { exportLeadsHandler } from "../controllers/leadExportController";
import { authMiddleware, tenantMiddleware } from "../middlewares/authMiddleware";
import { requireActiveSubscription } from "../middlewares/featureAccessMiddleware";
import { requireModule } from "../middlewares/moduleAccessMiddleware";
import { validate } from "../middlewares/validationMiddleware";
import { createLeadSchema, createManualLeadSchema } from "../validations/leadValidation";
import { uploadMiddleware } from "../middlewares/uploadMiddleware";
import { widgetIPRateLimit, widgetSessionRateLimit } from "../middlewares/rateLimitMiddleware";

const router = Router();

router.post(
  "/",
  widgetIPRateLimit,
  widgetSessionRateLimit,
  validate(createLeadSchema),
  asyncHandler(createLeadHandler)
);

router.post(
  "/manual",
  authMiddleware,
  tenantMiddleware,
  requireModule("leads"),
  requireActiveSubscription(),
  validate(createManualLeadSchema),
  asyncHandler(createManualLeadHandler)
);

router.post(
  "/import/csv",
  authMiddleware,
  tenantMiddleware,
  requireModule("leads"),
  requireActiveSubscription(),
  uploadMiddleware.csv.single("file"),
  asyncHandler(importLeadsCsvHandler)
);

router.get("/export", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("leads"), 
  asyncHandler(exportLeadsHandler));

router.get("/", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("leads"), 
  asyncHandler(listLeadsHandler));

router.get("/:id", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("leads"), 
  asyncHandler(getLeadHandler));

export default router;

