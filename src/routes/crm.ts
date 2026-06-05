import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { authMiddleware, tenantMiddleware } from "../middlewares/authMiddleware";
import { requireModule } from "../middlewares/moduleAccessMiddleware";
import { requireUserId, validate } from "../middlewares/validationMiddleware";
import {
  backfillUnsyncedLeadsToCrmSchema,
  connectCrmIntegrationSchema,
  disconnectCrmIntegrationSchema,
  getCrmFieldsSchema,
  listCrmFieldMappingsSchema,
  listCrmSyncLogsSchema,
  saveCrmFieldMappingSchema,
  setPrimaryLeadSyncProviderSchema,
  syncLeadToCrmSchema,
  syncLeadsBulkToCrmSchema,
  testCrmWebhookSchema,
} from "../validations/crmValidation";
import {
  connectCrmIntegrationHandler,
  backfillUnsyncedLeadsToCrmHandler,
  disconnectCrmIntegrationHandler,
  getCrmFieldsHandler,
  listCrmFieldMappingsHandler,
  listCrmIntegrationsHandler,
  setPrimaryLeadSyncProviderHandler,
  listCrmSyncLogsHandler,
  saveCrmFieldMappingHandler,
  syncLeadsBulkToCrmHandler,
  syncLeadToCrmHandler,
  testCrmWebhookHandler,
} from "../controllers/crmController";
import { crmMutationRateLimit } from "../middlewares/rateLimitMiddleware";

const router = Router();

router.post(
  "/integrations/connect",
  authMiddleware,
  tenantMiddleware,
  requireUserId,
  requireModule("integrations"),
  validate(connectCrmIntegrationSchema),
  crmMutationRateLimit,
  asyncHandler(connectCrmIntegrationHandler)
);
router.get(
  "/integrations",
  authMiddleware,
  tenantMiddleware,
  requireModule("integrations"),
  asyncHandler(listCrmIntegrationsHandler)
);
router.post(
  "/integrations/primary-provider",
  authMiddleware,
  tenantMiddleware,
  requireUserId,
  requireModule("integrations"),
  validate(setPrimaryLeadSyncProviderSchema),
  asyncHandler(setPrimaryLeadSyncProviderHandler)
);
router.delete(
  "/integrations/:id",
  authMiddleware,
  tenantMiddleware,
  requireUserId,
  requireModule("integrations"),
  validate(disconnectCrmIntegrationSchema),
  crmMutationRateLimit,
  asyncHandler(disconnectCrmIntegrationHandler)
);

router.post(
  "/webhook/test",
  authMiddleware,
  tenantMiddleware,
  requireUserId,
  requireModule("integrations"),
  validate(testCrmWebhookSchema),
  crmMutationRateLimit,
  asyncHandler(testCrmWebhookHandler)
);
router.post(
  "/sync/lead/:leadId",
  authMiddleware,
  tenantMiddleware,
  requireModule("integrations"),
  validate(syncLeadToCrmSchema),
  crmMutationRateLimit,
  asyncHandler(syncLeadToCrmHandler)
);
router.post(
  "/sync/leads/bulk",
  authMiddleware,
  tenantMiddleware,
  requireModule("integrations"),
  validate(syncLeadsBulkToCrmSchema),
  crmMutationRateLimit,
  asyncHandler(syncLeadsBulkToCrmHandler)
);
router.post(
  "/sync/leads/backfill",
  authMiddleware,
  tenantMiddleware,
  requireModule("integrations"),
  validate(backfillUnsyncedLeadsToCrmSchema),
  crmMutationRateLimit,
  asyncHandler(backfillUnsyncedLeadsToCrmHandler)
);
router.get(
  "/sync/logs",
  authMiddleware,
  tenantMiddleware,
  requireModule("integrations"),
  validate(listCrmSyncLogsSchema),
  asyncHandler(listCrmSyncLogsHandler)
);

router.get(
  "/fields/:provider",
  authMiddleware,
  tenantMiddleware,
  requireModule("integrations"),
  validate(getCrmFieldsSchema),
  asyncHandler(getCrmFieldsHandler)
);
router.post(
  "/field-mapping",
  authMiddleware,
  tenantMiddleware,
  requireUserId,
  requireModule("integrations"),
  validate(saveCrmFieldMappingSchema),
  asyncHandler(saveCrmFieldMappingHandler)
);
router.get(
  "/field-mapping",
  authMiddleware,
  tenantMiddleware,
  requireModule("integrations"),
  validate(listCrmFieldMappingsSchema),
  asyncHandler(listCrmFieldMappingsHandler)
);

export default router;
