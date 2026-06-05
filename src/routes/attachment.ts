import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { authMiddleware, tenantMiddleware } from "../middlewares/authMiddleware";
import { requireModule } from "../middlewares/moduleAccessMiddleware";
import { validate } from "../middlewares/validationMiddleware";
import {
  validateAttachmentLimits,
  validateVisitorAttachment,
} from "../middlewares/attachmentValidationMiddleware";
import {
  uploadAttachmentSchema,
  uploadAttachmentVisitorSchema,
  getAttachmentByIdSchema,
  getAttachmentSignedUrlSchema,
  getAttachmentsByMessageSchema,
  getAttachmentsByChatSchema,
  deleteAttachmentSchema,
} from "../validations/attachmentValidation";
import {
  uploadAttachmentHandler,
  getAttachmentByIdHandler,
  getAttachmentSignedUrlHandler,
  getAttachmentsByMessageHandler,
  getAttachmentsByChatHandler,
  deleteAttachmentHandler,
  uploadAttachmentVisitorHandler,
} from "../controllers/attachmentController";
import { attachmentUploadMiddleware } from "../middlewares/uploadMiddleware";

const router = Router();

router.post(
  "/visitor",
  attachmentUploadMiddleware,
  validate(uploadAttachmentVisitorSchema),
  validateVisitorAttachment,
  validateAttachmentLimits,
  asyncHandler(uploadAttachmentVisitorHandler)
);

router.post(
  "/",
  authMiddleware,
  tenantMiddleware,
  requireModule("attachments"),
  attachmentUploadMiddleware,
  validate(uploadAttachmentSchema),
  validateAttachmentLimits,
  asyncHandler(uploadAttachmentHandler)
);

router.get(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  requireModule("attachments"),
  validate(getAttachmentByIdSchema),
  asyncHandler(getAttachmentByIdHandler)
);

router.get(
  "/:id/signed-url",
  authMiddleware,
  tenantMiddleware,
  requireModule("attachments"),
  validate(getAttachmentSignedUrlSchema),
  asyncHandler(getAttachmentSignedUrlHandler)
);

router.get(
  "/message/:messageId",
  authMiddleware,
  tenantMiddleware,
  requireModule("attachments"),
  validate(getAttachmentsByMessageSchema),
  asyncHandler(getAttachmentsByMessageHandler)
);

router.get(
  "/chat/:chatId",
  authMiddleware,
  tenantMiddleware,
  requireModule("attachments"),
  validate(getAttachmentsByChatSchema),
  asyncHandler(getAttachmentsByChatHandler)
);

router.delete(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  requireModule("attachments"),
  validate(deleteAttachmentSchema),
  asyncHandler(deleteAttachmentHandler)
);

export default router;

