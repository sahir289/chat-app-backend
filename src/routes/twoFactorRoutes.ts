import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { authMiddleware, tenantMiddleware } from "../middlewares/authMiddleware";
import { requireModule } from "../middlewares/moduleAccessMiddleware";
import { companySuspensionMiddleware } from "../middlewares/companySuspensionMiddleware";
import { validate } from "../middlewares/validationMiddleware";
import {
    twoFactorRateLimit,
    twoFactorVerificationRateLimit,
} from "../middlewares/rateLimitMiddleware";
import {
    verifySetup2FASchema,
    verify2FASchema,
    disable2FASchema,
    generateBackupCodesSchema,
} from "../validations/authValidation";
import {
    setup2FAHandler,
    verifySetup2FAHandler,
    verify2FAHandler,
    disable2FAHandler,
    generateBackupCodesHandler,
} from "../controllers/twoFactorController";

const router = Router();

router.post(
    "/setup",
    authMiddleware,
    tenantMiddleware,
    requireModule("account"),
    companySuspensionMiddleware,
    asyncHandler(setup2FAHandler)
);

router.post(
    "/verify-setup",
    authMiddleware,
    tenantMiddleware,
    requireModule("account"),
    companySuspensionMiddleware,
    twoFactorRateLimit,
    validate(verifySetup2FASchema),
    asyncHandler(verifySetup2FAHandler)
);

router.post(
    "/verify",
    twoFactorVerificationRateLimit,
    validate(verify2FASchema),
    asyncHandler(verify2FAHandler)
);

router.post(
    "/disable",
    authMiddleware,
    tenantMiddleware,
    requireModule("account"),
    companySuspensionMiddleware,
    validate(disable2FASchema),
    asyncHandler(disable2FAHandler)
);

router.post(
    "/backup-codes",
    authMiddleware,
    tenantMiddleware,
    requireModule("account"),
    companySuspensionMiddleware,
    twoFactorRateLimit,
    validate(generateBackupCodesSchema),
    asyncHandler(generateBackupCodesHandler)
);

export default router;

