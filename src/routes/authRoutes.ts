import { Router } from "express";
import { authMiddleware, optionalAuthMiddleware, tenantMiddleware } from "../middlewares/authMiddleware";
import { requireModule } from "../middlewares/moduleAccessMiddleware";
import { adminOnly } from "../middlewares/roleMiddleware";
import { companySuspensionMiddleware } from "../middlewares/companySuspensionMiddleware";
import { validate } from "../middlewares/validationMiddleware";
import { asyncHandler } from "../middlewares/asyncHandler";
import { validatePasswordMiddleware } from "../middlewares/passwordValidationMiddleware";
import {
    loginRateLimit,
    login2FARateLimit,
    forgotPasswordRateLimit,
    resetPasswordRateLimit,
    resendVerificationRateLimit,
    loginUnverifiedEmailRateLimit,
    registerIpRateLimit,
    registerEmailRateLimit,
    refreshTokenRateLimit,
    verifyEmailRateLimit,
    acceptInviteRateLimit,
    validateInviteRateLimit,
} from "../middlewares/rateLimitMiddleware";
import {
    registerSchema,
    loginSchema,
    refreshTokenSchema,
    changePasswordSchema,
    updateProfileSchema,
    validateInviteTokenSchema,
    acceptInviteSchema,
    inviteSchema,
    verifyEmailSchema,
    resendVerificationEmailSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    verify2FASchema,
    updateSettingsSchema,
} from "../validations/authValidation";
import {
    changePasswordHandler,
    deleteAccountHandler,
    logoutHandler,
    loginHandler,
    completeLoginWith2FAHandler,
    meHandler,
    refreshHandler,
    registerHandler,
    updateProfileHandler,
    getSettingsHandler,
    updateSettingsHandler,
    inviteHandler,
    acceptInviteHandler,
    validateInviteTokenHandler,
    verifyEmailHandler,
    resendVerificationEmailHandler,
    forgotPasswordHandler,
    resetPasswordHandler,
    uploadAvatarHandler,
} from "../controllers/authController";

const router = Router();

router.post("/register", 
  registerIpRateLimit, 
  registerEmailRateLimit, 
  validate(registerSchema), 
  validatePasswordMiddleware("password"), 
  asyncHandler(registerHandler));

router.post("/login", 
  loginRateLimit, 
  validate(loginSchema), 
  loginUnverifiedEmailRateLimit, 
  asyncHandler(loginHandler));

router.post("/login/2fa", 
  login2FARateLimit, 
  validate(verify2FASchema), 
  asyncHandler(completeLoginWith2FAHandler));

router.post("/refresh", 
  refreshTokenRateLimit, 
  validate(refreshTokenSchema), 
  asyncHandler(refreshHandler));

router.get("/validate-invite", 
  validateInviteRateLimit, 
  validate(validateInviteTokenSchema), 
  asyncHandler(validateInviteTokenHandler));

router.post("/accept-invite", 
  acceptInviteRateLimit, 
  validate(acceptInviteSchema), 
  validatePasswordMiddleware("password"), 
  asyncHandler(acceptInviteHandler));

router.get("/verify-email", 
  verifyEmailRateLimit, 
  validate(verifyEmailSchema), 
  asyncHandler(verifyEmailHandler));

router.post("/resend-verification-email", 
  resendVerificationRateLimit, 
  validate(resendVerificationEmailSchema), 
  asyncHandler(resendVerificationEmailHandler));

router.post("/forgot-password", 
  forgotPasswordRateLimit, 
  validate(forgotPasswordSchema), 
  asyncHandler(forgotPasswordHandler));

router.post("/reset-password", 
  resetPasswordRateLimit, 
  validate(resetPasswordSchema), 
  validatePasswordMiddleware("newPassword"), 
  asyncHandler(resetPasswordHandler));

router.post("/logout", 
  optionalAuthMiddleware,
  asyncHandler(logoutHandler));

router.get("/me", 
  authMiddleware, 
  companySuspensionMiddleware, 
  asyncHandler(meHandler));

router.patch(
  "/me",
  authMiddleware,
  tenantMiddleware,
  requireModule("account"),
  companySuspensionMiddleware,
  validate(updateProfileSchema),
  asyncHandler(updateProfileHandler)
);

router.post(
  "/profile/avatar",
  authMiddleware,
  tenantMiddleware,
  requireModule("account"),
  companySuspensionMiddleware,
  ...uploadAvatarHandler
);

router.post(
  "/change-password",
  authMiddleware,
  tenantMiddleware,
  requireModule("account"),
  companySuspensionMiddleware,
  validate(changePasswordSchema),
  validatePasswordMiddleware("newPassword"),
  asyncHandler(changePasswordHandler)
);

router.delete(
  "/delete-account",
  authMiddleware,
  tenantMiddleware,
  requireModule("account"),
  companySuspensionMiddleware,
  asyncHandler(deleteAccountHandler)
);

router.get("/settings", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("account"), 
  companySuspensionMiddleware, 
  asyncHandler(getSettingsHandler));

router.patch(
  "/settings",
  authMiddleware,
  tenantMiddleware,
  requireModule("account"),
  companySuspensionMiddleware,
  validate(updateSettingsSchema),
  asyncHandler(updateSettingsHandler)
);

router.post("/invite", 
  authMiddleware, 
  tenantMiddleware, 
  companySuspensionMiddleware, 
  adminOnly, validate(inviteSchema), 
  asyncHandler(inviteHandler));
 
export default router;

