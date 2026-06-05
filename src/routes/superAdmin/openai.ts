import { Router } from "express";
import { asyncHandler } from "../../middlewares/asyncHandler";
import { authMiddleware } from "../../middlewares/authMiddleware";
import { superAdminOnly } from "../../middlewares/roleMiddleware";
import { listOpenAiModelsCatalogHandler } from "../../controllers/superAdminOpenAiController";

const router = Router();

router.get("/models", 
    authMiddleware, 
    superAdminOnly, 
    asyncHandler(listOpenAiModelsCatalogHandler));

export default router;
