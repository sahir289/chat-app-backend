import { attachmentRepository } from "../repositories/attachmentRepository";
import { messageRepository } from "../repositories/messageRepository";
import { companyRepository } from "../repositories/companyRepository";
import { chatRepository } from "../repositories/chatRepository";
import { AppError } from "../utils/appError";
import {
  uploadFileToS3ByKey,
  deleteFileFromS3,
  buildAttachmentS3Key,
  getPresignedUrl,
  validateCompanyOwnership
} from "./s3Service";

export const attachmentService = {
  async uploadFile(file: Express.Multer.File, messageId: string, companyId: string, uploadedById?: string) {
    // Get message to get createdAt timestamp and verify ownership
    const message = await messageRepository.findById(messageId);
    if (!message) {
      throw new AppError(404, "Message not found");
    }

    // Get chat info to build proper S3 path
    const chat = await messageRepository.getChatByMessageId(messageId);
    if (!chat) {
      throw new AppError(404, "Chat not found");
    }

    // Verify company ownership
    if (chat.companyId !== companyId) {
      throw new AppError(403, "Access denied: Message does not belong to your company");
    }

    // Detect file type: image/* -> IMAGE, application/pdf -> FILE
    const isImage = file.mimetype.startsWith("image/");
    const isPdf = file.mimetype === "application/pdf";

    // Set Content-Disposition: inline for PDFs so they open in browser instead of downloading
    const contentDisposition = isPdf ? "inline" : undefined;

    // Get company to get company name for S3 path
    const company = await companyRepository.findById(companyId);

    // Build S3 key with proper structure: {companyName}/attachments/{companyId}/YYYY/MM/DD/chats/{chatId}/messages/{messageId}/{uuid}.{ext}
    // Use message createdAt timestamp (not current date) for date folder structure
    const s3Key = buildAttachmentS3Key(
      companyId,
      chat.id,
      messageId,
      file.originalname,
      message.createdAt,
      company?.name
    );

    // Upload to S3 - store only the S3 key in DB, not the full URL
    const storedS3Key = await uploadFileToS3ByKey(
      file.buffer,
      s3Key,
      file.mimetype,
      contentDisposition
    );

    // Only set thumbnailUrl if it's different from fileUrl
    // For images, we use the same file, so set to null to avoid redundancy
    // In the future, if we generate actual thumbnails, they would be different
    const thumbnailS3Key = null;

    const attachment = await attachmentRepository.create({
      messageId,
      fileName: file.originalname,
      fileType: file.mimetype,
      fileSize: file.size,
      fileUrl: storedS3Key, // Store S3 key, not URL
      thumbnailUrl: thumbnailS3Key, // Store S3 key, not URL
      uploadedById: uploadedById || null,
    });

    // Return attachment with detected type for message type update
    return {
      ...attachment,
      detectedType: isImage ? "IMAGE" : "FILE" as "IMAGE" | "FILE",
    };
  },

  async getAttachmentById(id: string, companyId: string) {
    const attachment = await attachmentRepository.findById(id);
    if (!attachment) {
      throw new AppError(404, "Attachment not found");
    }

    if (attachment.message?.chat?.companyId !== companyId) {
      throw new AppError(403, "Access denied");
    }

    // Validate S3 key belongs to company (extra security check)
    if (attachment.fileUrl && !validateCompanyOwnership(attachment.fileUrl, companyId)) {
      throw new AppError(403, "Access denied: Invalid file ownership");
    }

    return attachment;
  },

  /**
   * Generate signed URL for an attachment with company ownership validation
   */
  async getAttachmentSignedUrl(attachmentId: string, companyId: string, expiresIn: number = 3600): Promise<string> {
    const attachment = await this.getAttachmentById(attachmentId, companyId);

    if (!attachment.fileUrl) {
      throw new AppError(404, "File not found");
    }

    // Generate presigned URL with company validation (validates ownership internally)
    return getPresignedUrl(attachment.fileUrl, companyId, expiresIn);
  },

  async getAttachmentsByMessageId(messageId: string, companyId: string) {
    const message = await messageRepository.findById(messageId);
    if (!message) {
      throw new AppError(404, "Message not found");
    }

    const chat = await messageRepository.getChatByMessageId(messageId);
    if (!chat || chat.companyId !== companyId) {
      throw new AppError(403, "Access denied");
    }

    return attachmentRepository.findByMessageId(messageId);
  },

  async getAttachmentsByChatId(chatId: string, companyId: string) {
    const chat = await chatRepository.findById(chatId, companyId);
    if (!chat) {
      throw new AppError(403, "Access denied");
    }

    return attachmentRepository.listByChatId(chatId);
  },

  async deleteAttachment(id: string, companyId: string) {
    const attachment = await attachmentRepository.findById(id);
    if (!attachment) {
      throw new AppError(404, "Attachment not found");
    }

    if (!attachment.message || !attachment.message.chat || attachment.message.chat.companyId !== companyId) {
      throw new AppError(403, "Access denied");
    }

    // Validate S3 key belongs to company before deletion
    if (attachment.fileUrl && !validateCompanyOwnership(attachment.fileUrl, companyId)) {
      throw new AppError(403, "Access denied: Invalid file ownership");
    }

    // Delete from S3 (works with both S3 keys and URLs)
    if (attachment.fileUrl) {
      await deleteFileFromS3(attachment.fileUrl);
    }

    // Delete thumbnail if it exists and is different from main file
    // (thumbnailUrl is null for new uploads, but may exist for legacy data)
    if (attachment.thumbnailUrl && attachment.thumbnailUrl !== attachment.fileUrl) {
      await deleteFileFromS3(attachment.thumbnailUrl);
    }

    await attachmentRepository.delete(id);
  },
};


