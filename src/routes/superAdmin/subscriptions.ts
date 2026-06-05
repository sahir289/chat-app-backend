import { Router } from "express";
import { asyncHandler } from "../../middlewares/asyncHandler";
import { authMiddleware } from "../../middlewares/authMiddleware";
import { superAdminOnly } from "../../middlewares/roleMiddleware";
import {
    getAllSubscriptionsHandler,
    getSubscriptionDetailsHandler,
    getSubscriptionByCompanyHandler,
    enableProAccessHandler,
    disableProAccessHandler,
    changePlanHandler,
    changeStatusHandler,
} from "../../controllers/superAdminSubscriptionController";

const router = Router();

router.get("/", 
    authMiddleware, 
    superAdminOnly, 
    asyncHandler(getAllSubscriptionsHandler));

router.get("/by-company/:companyId", 
    authMiddleware, 
    superAdminOnly, 
    asyncHandler(getSubscriptionByCompanyHandler));

router.get("/:id", 
    authMiddleware, 
    superAdminOnly, 
    asyncHandler(getSubscriptionDetailsHandler));

router.post("/:id/enable-pro", 
    authMiddleware, 
    superAdminOnly, 
    asyncHandler(enableProAccessHandler));

router.post("/:id/disable-pro", 
    authMiddleware, 
    superAdminOnly, 
    asyncHandler(disableProAccessHandler));

// These routes must come before /:id/enable-pro and /:id/disable-pro to avoid conflicts
router.post("/:id/change-plan", 
    authMiddleware, 
    superAdminOnly, 
    asyncHandler(changePlanHandler));

router.post("/:id/change-status", 
    authMiddleware, 
    superAdminOnly, 
    asyncHandler(changeStatusHandler));

export default router;

