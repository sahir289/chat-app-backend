import { Router } from "express";
import { getAiUsageHandler, getAiUsageHistoryHandler } from "../controllers/aiController";
import {
    createAiCreditsAddonRequestHandler,
    listAllAiCreditsAddonRequestsHandler,
    listMyAiCreditsAddonRequestsHandler,
    updateAiCreditsAddonRequestStatusHandler,
} from "../controllers/aiCreditsAddonRequestController";
import { authMiddleware, tenantMiddleware } from "../middlewares/authMiddleware";
import { requireModule } from "../middlewares/moduleAccessMiddleware";
import { asyncHandler } from "../middlewares/asyncHandler";
import { companySuspensionMiddleware } from "../middlewares/companySuspensionMiddleware";
import { adminOnly, superAdminOnly } from "../middlewares/roleMiddleware";
import { requireCompany } from "../middlewares/requireCompanyMiddleware";
import { validate } from "../middlewares/validationMiddleware";
import {
    createAiCreditsAddonRequestSchema,
    updateAiCreditsAddonRequestStatusSchema,
} from "../validations/aiCreditsAddonRequestValidation";

const router = Router();

router.get(
    "/usage",
    authMiddleware,
    tenantMiddleware,
    requireCompany,
    companySuspensionMiddleware,
    asyncHandler(getAiUsageHandler)
);

router.get(
    "/usage-history",
    authMiddleware,
    tenantMiddleware,
    requireCompany,
    companySuspensionMiddleware,
    asyncHandler(getAiUsageHistoryHandler)
);

router.get(
    "/addon-requests/my",
    authMiddleware,
    tenantMiddleware,
    requireModule("company"),
    companySuspensionMiddleware,
    asyncHandler(listMyAiCreditsAddonRequestsHandler)
);

router.post(
    "/addon-requests",
    authMiddleware,
    tenantMiddleware,
    companySuspensionMiddleware,
    adminOnly,
    validate(createAiCreditsAddonRequestSchema),
    asyncHandler(createAiCreditsAddonRequestHandler)
);

router.get(
    "/addon-requests/admin/all",
    authMiddleware,
    superAdminOnly,
    asyncHandler(listAllAiCreditsAddonRequestsHandler)
);

router.patch(
    "/addon-requests/admin/:id/status",
    authMiddleware,
    superAdminOnly,
    validate(updateAiCreditsAddonRequestStatusSchema),
    asyncHandler(updateAiCreditsAddonRequestStatusHandler)
);

export default router;
