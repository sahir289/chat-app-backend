import { Request, Response, NextFunction } from "express";
import { attachmentService } from "../services/attachmentService";
import {
  MAX_IMAGES_PER_MESSAGE,
  MAX_PDFS_PER_MESSAGE,
  MAX_TOTAL_FILES_PER_MESSAGE,
  MAX_FILE_SIZE,
  MAX_PDF_SIZE,
  MAX_TOTAL_UPLOAD_SIZE,
} from "../constants/attachmentsConstants";
import { AppError } from "../utils/appError";
import { AuthenticatedRequest } from "./authMiddleware";
import { chatRepository } from "../repositories/chatRepository";
import { messageRepository } from "../repositories/messageRepository";

/**
 * Middleware to validate file count limits per message
 * Checks existing attachments and validates against limits
 */
export async function validateAttachmentLimits(
  req: Request | AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { messageId } = req.body;
    const companyId = (req as AuthenticatedRequest).user?.companyId || (req as any).companyId;

    if (!messageId) {
      return next(new AppError(400, "messageId is required"));
    }

    if (!companyId) {
      return next(new AppError(401, "Unauthorized"));
    }

    const files = req.files as Express.Multer.File[];
    const file = req.file as Express.Multer.File | undefined;
    const filesToUpload = files && Array.isArray(files) ? files : (file ? [file] : []);

    if (filesToUpload.length === 0) {
      return next(new AppError(400, "At least one file is required"));
    }

    // Validate individual file sizes
    for (const file of filesToUpload) {
      const isPdf = file.mimetype === "application/pdf";
      const maxSize = isPdf ? MAX_PDF_SIZE : MAX_FILE_SIZE;
      const maxSizeMB = maxSize / 1024 / 1024;

      if (file.size > maxSize) {
        return next(
          new AppError(
            400,
            `File "${file.originalname}" exceeds maximum size of ${maxSizeMB}MB`
          )
        );
      }
    }

    // Validate cumulative upload size for a single request.
    const totalUploadSize = filesToUpload.reduce((sum, f) => sum + f.size, 0);
    if (totalUploadSize > MAX_TOTAL_UPLOAD_SIZE) {
      return next(
        new AppError(
          400,
          `Total upload size per send must not exceed ${MAX_TOTAL_UPLOAD_SIZE / 1024 / 1024}MB`
        )
      );
    }

    // Get existing attachments for this message to validate limits
    const existingAttachments = await attachmentService.getAttachmentsByMessageId(
      messageId,
      companyId
    );

    // Count existing images and PDFs
    const existingImages = existingAttachments.filter((att) =>
      att.fileType?.startsWith("image/")
    ).length;
    const existingPdfs = existingAttachments.filter(
      (att) => att.fileType === "application/pdf"
    ).length;
    const existingTotal = existingAttachments.length;

    // Count new images and PDFs being uploaded
    const newImages = filesToUpload.filter((f) => f.mimetype.startsWith("image/")).length;
    const newPdfs = filesToUpload.filter((f) => f.mimetype === "application/pdf").length;
    const newTotal = filesToUpload.length;

    // Validate total files limit
    if (existingTotal + newTotal > MAX_TOTAL_FILES_PER_MESSAGE) {
      return next(
        new AppError(
          400,
          `Maximum ${MAX_TOTAL_FILES_PER_MESSAGE} files allowed per message. This message already has ${existingTotal} file(s), and you're trying to add ${newTotal} more.`
        )
      );
    }

    // Validate image limit
    if (existingImages + newImages > MAX_IMAGES_PER_MESSAGE) {
      return next(
        new AppError(
          400,
          `You can upload up to ${MAX_IMAGES_PER_MESSAGE} images per message. This message already has ${existingImages} image(s), and you're trying to add ${newImages} more.`
        )
      );
    }

    // Validate PDF limit
    if (existingPdfs + newPdfs > MAX_PDFS_PER_MESSAGE) {
      return next(new AppError(400, "Only one PDF can be uploaded per message"));
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware to validate visitor attachment upload
 * Validates chat and message ownership
 */
export async function validateVisitorAttachment(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { messageId, chatId, sessionId } = req.body;

    if (!messageId || !chatId || !sessionId) {
      return next(new AppError(400, "messageId, chatId, and sessionId are required"));
    }

    const chat = await chatRepository.findById(chatId);
    if (!chat) {
      return next(new AppError(403, "Invalid chat"));
    }

    if (chat.sessionId !== sessionId) {
      return next(new AppError(403, "Invalid chat session"));
    }

    // Validate that the message belongs to the chat
    const message = await messageRepository.findById(messageId);
    if (!message || message.chatId !== chatId) {
      return next(new AppError(403, "Message does not belong to this chat"));
    }

    // Only allow visitor endpoint uploads for visitor messages
    if (message.senderType !== "VISITOR") {
      return next(new AppError(403, "Only visitor messages can use this endpoint"));
    }

    if (chat.visitorId && message.visitorId && message.visitorId !== chat.visitorId) {
      return next(new AppError(403, "Message does not belong to this visitor"));
    }

    // Store companyId in request for later use
    (req as any).companyId = chat.companyId;

    next();
  } catch (error) {
    next(error);
  }
}

