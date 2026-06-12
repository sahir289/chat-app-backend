import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { authMiddleware, tenantMiddleware } from "../middlewares/authMiddleware";
import { requireCompany } from "../middlewares/requireCompanyMiddleware";
import { validate } from "../middlewares/validationMiddleware";
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
import { getMessagesHandler } from "../controllers/messagesController";
import {
  listChatsSchema,
  getInboxSchema,
  getChatSchema,
  getChatMessagesSchema,
  assignChatSchema,
  listAssignableAgentsSchema,
  closeChatSchema,
  deleteChatSchema,
} from "../validations/chatsValidation";

const router = Router();

router.get(
  "/",
  authMiddleware,
  tenantMiddleware,
  requireCompany,
  requireModule("chats"),
  validate(listChatsSchema),
  asyncHandler(listChatsHandler)
);

router.get(
  "/inbox",
  authMiddleware,
  tenantMiddleware,
  requireCompany,
  requireModule("chats"),
  validate(getInboxSchema),
  asyncHandler(getInboxHandler)
);

router.get(
  "/assignable-agents",
  authMiddleware,
  tenantMiddleware,
  requireCompany,
  requireModule("chats"),
  validate(listAssignableAgentsSchema),
  asyncHandler(listAssignableAgentsHandler)
);

router.get(
  "/:id/messages",
  authMiddleware,
  tenantMiddleware,
  requireCompany,
  requireModule("messages"),
  validate(getChatMessagesSchema),
  asyncHandler(getMessagesHandler)
);

router.get(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  requireCompany,
  requireModule("chats"),
  validate(getChatSchema),
  asyncHandler(getChatHandler)
);

router.post(
  "/assign",
  authMiddleware,
  tenantMiddleware,
  requireCompany,
  requireModule("chats"),
  validate(assignChatSchema),
  asyncHandler(assignChatHandler)
);

router.post(
  "/close",
  authMiddleware,
  tenantMiddleware,
  requireCompany,
  requireModule("chats"),
  validate(closeChatSchema),
  asyncHandler(closeChatHandler)
);

router.delete(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  requireCompany,
  requireModule("chats"),
  validate(deleteChatSchema),
  asyncHandler(deleteChatHandler)
);

export default router;
