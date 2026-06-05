import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { authMiddleware } from "../middlewares/authMiddleware";
import { getFeatureAccessHandler, checkFeatureHandler } from "../controllers/featureAccessController";

const router = Router();

router.get("/", authMiddleware, asyncHandler(getFeatureAccessHandler));

router.get("/:feature", authMiddleware, asyncHandler(checkFeatureHandler));

export default router;
