import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { authMiddleware, tenantMiddleware } from "../middlewares/authMiddleware";
import { requireModule } from "../middlewares/moduleAccessMiddleware";
import { companySuspensionMiddleware } from "../middlewares/companySuspensionMiddleware";
import { companyRecoveryPermission, superAdminOnly } from "../middlewares/roleMiddleware";
import { validate } from "../middlewares/validationMiddleware";
import {
    updateCompanySchema,
    createCompanySchema,
    suspendCompanySchema,
    activateCompanySchema,
    getCompanyByIdSchema,
    getCompanyLeadsSchema,
    toggleProStatusSchema,
    updateCompanyOpenAiChatModelsSchema,
    getCompanyAiCreditsSchema,
    updateCompanyAiCreditsSchema,
    createCompanyAiTopupSchema,
    listCompaniesSchema,
} from "../validations/companyValidation";
import {
    getCompanyHandler,
    updateCompanyHandler,
    getCompanyByIdHandler,
    createCompanyHandler,
    listCompaniesHandler,
    suspendCompanyHandler,
    activateCompanyHandler,
    getCompanyLeadsHandler,
    toggleProStatusHandler,
    updateCompanyOpenAiChatModelsHandler,
    getCompanyAiCreditsHandler,
    updateCompanyAiCreditsHandler,
    createCompanyAiTopupHandler,
    getCompanyAiUsageHistoryHandler,
    uploadCompanyLogoHandler,
} from "../controllers/companyController";

const router = Router();

// Regular user routes - require authentication, tenant scope, and company suspension check
router.get("/me", 
    authMiddleware, 
    tenantMiddleware, 
    requireModule("company"), 
    companySuspensionMiddleware, 
    asyncHandler(getCompanyHandler));

router.patch("/update", 
    authMiddleware, 
    tenantMiddleware, 
    requireModule("company"), 
    companySuspensionMiddleware, 
    validate(updateCompanySchema), 
    asyncHandler(updateCompanyHandler));

router.post("/logo", 
    authMiddleware, 
    tenantMiddleware,
    requireModule("company"), 
    companySuspensionMiddleware, ...uploadCompanyLogoHandler);

// SUPER_ADMIN only routes - require authentication and super admin role
router.get("/", 
    authMiddleware, 
    superAdminOnly, 
    validate(listCompaniesSchema), 
    asyncHandler(listCompaniesHandler));

router.post("/", 
    authMiddleware, 
    superAdminOnly, 
    validate(createCompanySchema), 
    asyncHandler(createCompanyHandler));

router.get("/:id", 
    authMiddleware, 
    superAdminOnly, 
    validate(getCompanyByIdSchema), 
    asyncHandler(getCompanyByIdHandler));

router.get("/:id/leads", 
    authMiddleware, 
    superAdminOnly, 
    validate(getCompanyLeadsSchema), 
    asyncHandler(getCompanyLeadsHandler));

router.post("/:id/toggle-pro", 
    authMiddleware, 
    superAdminOnly, 
    validate(toggleProStatusSchema), 
    asyncHandler(toggleProStatusHandler));

router.put(
    "/:id/openai-chat-models",
    authMiddleware,
    superAdminOnly,
    validate(updateCompanyOpenAiChatModelsSchema),
    asyncHandler(updateCompanyOpenAiChatModelsHandler)
);

router.get(
    "/:id/ai-credits",
    authMiddleware,
    superAdminOnly,
    validate(getCompanyAiCreditsSchema),
    asyncHandler(getCompanyAiCreditsHandler)
);

router.patch(
    "/:id/ai-credits",
    authMiddleware,
    superAdminOnly,
    validate(updateCompanyAiCreditsSchema),
    asyncHandler(updateCompanyAiCreditsHandler)
);

router.post(
    "/:id/ai-topups",
    authMiddleware,
    superAdminOnly,
    validate(createCompanyAiTopupSchema),
    asyncHandler(createCompanyAiTopupHandler)
);

router.get(
    "/:id/ai-usage-history",
    authMiddleware,
    superAdminOnly,
    validate(getCompanyAiCreditsSchema),
    asyncHandler(getCompanyAiUsageHistoryHandler)
);

router.post("/:id/suspend", 
    authMiddleware, 
    superAdminOnly, 
    validate(suspendCompanySchema), 
    asyncHandler(suspendCompanyHandler));

router.post("/:id/activate", 
    authMiddleware, 
    companyRecoveryPermission,
    validate(activateCompanySchema), 
    asyncHandler(activateCompanyHandler));

export default router;

