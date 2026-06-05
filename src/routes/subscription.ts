import { asyncHandler } from "../middlewares/asyncHandler";
import { Router } from "express";
import { authMiddleware, tenantMiddleware } from "../middlewares/authMiddleware";
import { requireModule } from "../middlewares/moduleAccessMiddleware";
import { companySuspensionMiddleware } from "../middlewares/companySuspensionMiddleware";
import {
  getSubscriptionHandler,
  getSubscriptionByIdHandler,
  getInvoicesHandler,
  getUsageRecordsHandler,
} from "../controllers/subscriptionController";

const router = Router();

router.get(
  "/me",
  authMiddleware,
  tenantMiddleware,
  requireModule("billing"),
  companySuspensionMiddleware,
  asyncHandler(getSubscriptionHandler)
);
router.get(
  "/invoices",
  authMiddleware,
  tenantMiddleware,
  requireModule("billing"),
  companySuspensionMiddleware,
  asyncHandler(getInvoicesHandler)
);
router.get(
  "/:id/usage",
  authMiddleware,
  tenantMiddleware,
  requireModule("billing"),
  companySuspensionMiddleware,
  asyncHandler(getUsageRecordsHandler)
);
router.get(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  requireModule("billing"),
  companySuspensionMiddleware,
  asyncHandler(getSubscriptionByIdHandler)
);

export default router;

