import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import {
    createFAQHandler,
    getFAQsHandler,
    updateFAQHandler,
    deleteFAQHandler,
    searchFAQsHandler,
} from "../controllers/faqController";
import { authMiddleware, tenantMiddleware } from "../middlewares/authMiddleware";
import { requireCompany } from "../middlewares/requireCompanyMiddleware";
import { validate } from "../middlewares/validationMiddleware";
import { 
    createFAQSchema, 
    updateFAQSchema, 
    getFAQsSchema, 
    deleteFAQSchema, 
    searchFAQsSchema 
} from "../validations/faqValidation";

const router = Router();

// Public search endpoint (for widget) - no auth required
router.post("/search/:propertyId", 
    validate(searchFAQsSchema), 
    asyncHandler(searchFAQsHandler));

// Protected CRUD endpoints
router.post("/", 
    authMiddleware, 
    tenantMiddleware, 
    requireCompany, 
    validate(createFAQSchema), 
    asyncHandler(createFAQHandler));

router.get("/:propertyId", 
    authMiddleware, 
    tenantMiddleware, 
    requireCompany, 
    validate(getFAQsSchema), 
    asyncHandler(getFAQsHandler));

router.put("/:id", 
    authMiddleware, 
    tenantMiddleware, 
    requireCompany, 
    validate(updateFAQSchema), 
    asyncHandler(updateFAQHandler));

router.delete("/:id", 
    authMiddleware, 
    tenantMiddleware, 
    requireCompany, 
    validate(deleteFAQSchema), 
    asyncHandler(deleteFAQHandler));

export default router;

