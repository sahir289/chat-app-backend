import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import {
    createQuickReplyHandler,
    getQuickRepliesHandler,
    updateQuickReplyHandler,
    deleteQuickReplyHandler,
    getPublicQuickRepliesHandler,
} from "../controllers/quickReplyController";
import { authMiddleware, tenantMiddleware } from "../middlewares/authMiddleware";
import { requireCompany } from "../middlewares/requireCompanyMiddleware";
import { validate } from "../middlewares/validationMiddleware";
import {
    createQuickReplySchema,
    updateQuickReplySchema,
    getQuickRepliesSchema,
    deleteQuickReplySchema,
    getPublicQuickRepliesSchema,
} from "../validations/quickReplyValidation";

const router = Router();

// Public endpoint (no auth) - must be before auth middleware
// Note: This route must come before /:propertyId to avoid route conflicts
router.get("/", 
    validate(getPublicQuickRepliesSchema), 
    asyncHandler(getPublicQuickRepliesHandler));

// CRUD endpoints
router.post("/", 
    authMiddleware, 
    tenantMiddleware, 
    requireCompany, 
    validate(createQuickReplySchema), 
    asyncHandler(createQuickReplyHandler));

router.get("/:propertyId", 
    authMiddleware, 
    tenantMiddleware, 
    requireCompany, 
    validate(getQuickRepliesSchema), 
    asyncHandler(getQuickRepliesHandler));

router.put("/:id", 
    authMiddleware, 
    tenantMiddleware, 
    requireCompany, 
    validate(updateQuickReplySchema), 
    asyncHandler(updateQuickReplyHandler));

router.delete("/:id", 
    authMiddleware, 
    tenantMiddleware, 
    requireCompany, 
    validate(deleteQuickReplySchema), 
    asyncHandler(deleteQuickReplyHandler));

export default router;

