import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { authMiddleware, tenantMiddleware } from "../middlewares/authMiddleware";
import { requireModule } from "../middlewares/moduleAccessMiddleware";
import {
  listChatsHandler,
  getChatHandler,
  getInboxHandler,
  assignChatHandler,
  listAssignableAgentsHandler,
  closeChatHandler,
  deleteChatHandler,
} from "../controllers/chatsController";

const router = Router();

router.get("/", 
  authMiddleware, 
  tenantMiddleware,
  requireModule("chats"), 
  asyncHandler(listChatsHandler));

router.get("/inbox", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("chats"), 
  asyncHandler(getInboxHandler));

router.get("/assignable-agents", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("chats"), 
  asyncHandler(listAssignableAgentsHandler));

router.get("/:id", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("chats"), 
  asyncHandler(getChatHandler));

router.post("/assign", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("chats"), 
  asyncHandler(assignChatHandler));

router.post("/close", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("chats"), 
  asyncHandler(closeChatHandler));

router.delete("/:id", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("chats"), 
  asyncHandler(deleteChatHandler));

export default router;

