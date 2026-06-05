import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { authMiddleware } from "../middlewares/authMiddleware";
import { getModuleAccessHandler, checkModuleHandler } from "../controllers/moduleAccessController";

const router = Router();

router.get("/", authMiddleware, asyncHandler(getModuleAccessHandler));

router.get("/:module", authMiddleware, asyncHandler(checkModuleHandler));

export default router;
