import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { authMiddleware, tenantMiddleware } from "../middlewares/authMiddleware";
import { requireModule } from "../middlewares/moduleAccessMiddleware";
import {
  getMessagesHandler,
  createMessageHandler,
  editMessageHandler,
} from "../controllers/messagesController";

const router = Router();

router.get("/:chatId", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("messages"), 
  asyncHandler(getMessagesHandler));

router.post("/", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("messages"), 
  asyncHandler(createMessageHandler));

router.patch("/:messageId/edit",
  authMiddleware, 
  tenantMiddleware, 
  requireModule("messages"), 
  asyncHandler(editMessageHandler));

export default router;

