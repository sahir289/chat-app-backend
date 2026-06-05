import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { authMiddleware, tenantMiddleware } from "../middlewares/authMiddleware";
import { requireFeature } from "../middlewares/featureAccessMiddleware";
import {
  createWebhookHandler,
  listWebhooksHandler,
  getWebhookByIdHandler,
  updateWebhookHandler,
  deleteWebhookHandler,
  getDeliveriesHandler,
  getDeliveryByIdHandler,
  testWebhookHandler,
} from "../controllers/webhookController";

const router = Router();

router.post("/", 
  authMiddleware, 
  tenantMiddleware, 
  requireFeature("webhooks"), 
  asyncHandler(createWebhookHandler));

router.get("/", 
  authMiddleware, 
  tenantMiddleware, 
  requireFeature("webhooks"), 
  asyncHandler(listWebhooksHandler));

router.post("/:id/test", 
  authMiddleware, 
  tenantMiddleware, 
  requireFeature("webhooks"), 
  asyncHandler(testWebhookHandler));

router.get("/:webhookId/deliveries", 
  authMiddleware, 
  tenantMiddleware, 
  requireFeature("webhooks"), 
  asyncHandler(getDeliveriesHandler));

router.get("/deliveries/:id", 
  authMiddleware, 
  tenantMiddleware, 
  requireFeature("webhooks"), 
  asyncHandler(getDeliveryByIdHandler));

router.get("/:id", 
  authMiddleware, 
  tenantMiddleware, 
  requireFeature("webhooks"), 
  asyncHandler(getWebhookByIdHandler));

router.patch("/:id", 
  authMiddleware, 
  tenantMiddleware, 
  requireFeature("webhooks"), 
  asyncHandler(updateWebhookHandler));

router.delete("/:id", 
  authMiddleware, 
  tenantMiddleware, 
  requireFeature("webhooks"), 
  asyncHandler(deleteWebhookHandler));

export default router;

