import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { authMiddleware, tenantMiddleware } from "../middlewares/authMiddleware";
import { requireModule } from "../middlewares/moduleAccessMiddleware";
import { getVisitorBySessionHandler, updateVisitorHandler, listVisitorsHandler } from "../controllers/visitorController";

const router = Router();

// List visitors with pagination (must be before /:sessionId route)
router.get("/", 
    authMiddleware, 
    tenantMiddleware, 
    requireModule("visitors"), 
    asyncHandler(listVisitorsHandler));

router.get("/:sessionId", 
    authMiddleware, 
    tenantMiddleware, 
    requireModule("visitors"), 
    asyncHandler(getVisitorBySessionHandler));

router.patch("/:sessionId", 
    authMiddleware, 
    tenantMiddleware, 
    requireModule("visitors"), 
    asyncHandler(updateVisitorHandler));

export default router;

