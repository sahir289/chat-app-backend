import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import {
    createChatbotFlowHandler,
    getChatbotFlowsHandler,
    updateChatbotFlowHandler,
    deleteChatbotFlowHandler,
} from "../controllers/chatbotFlowController";
import { authMiddleware, tenantMiddleware } from "../middlewares/authMiddleware";
import { requireCompany } from "../middlewares/requireCompanyMiddleware";
import { validate } from "../middlewares/validationMiddleware";
import {
    createChatbotFlowSchema,
    updateChatbotFlowSchema,
    getChatbotFlowsSchema,
    deleteChatbotFlowSchema,
} from "../validations/chatbotFlowValidation";

const router = Router();

// CRUD endpoints
router.post("/", 
    authMiddleware, 
    tenantMiddleware, 
    requireCompany, 
    validate(createChatbotFlowSchema), 
    asyncHandler(createChatbotFlowHandler));

router.get("/:propertyId", 
    authMiddleware, 
    tenantMiddleware, 
    requireCompany, 
    validate(getChatbotFlowsSchema), 
    asyncHandler(getChatbotFlowsHandler));

router.put("/:id", 
    authMiddleware, 
    tenantMiddleware, 
    requireCompany, 
    validate(updateChatbotFlowSchema), 
    asyncHandler(updateChatbotFlowHandler));

router.delete("/:id", 
    authMiddleware, 
    tenantMiddleware, 
    requireCompany, 
    validate(deleteChatbotFlowSchema), 
    asyncHandler(deleteChatbotFlowHandler));

export default router;

