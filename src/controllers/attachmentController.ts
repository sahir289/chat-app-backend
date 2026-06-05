import type { Request, Response } from "express";
import type { Attachment } from "@prisma/client";
import { attachmentService } from "../services/attachmentService";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { chatRepository } from "../repositories/chatRepository";
import { messageRepository } from "../repositories/messageRepository";
import { attachmentRepository } from "../repositories/attachmentRepository";
import { MessageType } from "@prisma/client";
import { successResponse, errorResponse } from "../utils/apiResponse";
import { getIO, broadcastMessage } from "../socket/index";
import { getPresignedUrl } from "../services/s3Service";
import { getAttachmentSignedUrlSchema } from "../validations/attachmentValidation";
import { chatLifecycleService } from "../services/chat/chatLifecycleService";
import { getMessageAttachmentsWithUrls } from "../helpers/chat/chatRequestHelpers";

const PRESIGN_TTL_SEC = 3600;

type BroadcastAttachment = {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
  thumbnailUrl: string | null;
  createdAt: Date;
};

async function presignAttachmentForBroadcast(
  att: Pick<
    Attachment,
    "id" | "fileName" | "fileType" | "fileSize" | "fileUrl" | "thumbnailUrl" | "createdAt"
  >,
  companyId: string
): Promise<BroadcastAttachment | null> {
  let fileUrl: string | null = null;
  let thumbnailUrl: string | null = null;

  if (att.fileUrl && companyId) {
    try {
      fileUrl = await getPresignedUrl(att.fileUrl, companyId, PRESIGN_TTL_SEC);
    } catch {
      // skip — cannot expose attachment without a working file URL
    }
  }

  if (att.thumbnailUrl && companyId) {
    try {
      thumbnailUrl = await getPresignedUrl(att.thumbnailUrl, companyId, PRESIGN_TTL_SEC);
    } catch {
      // optional thumbnail
    }
  }

  if (!fileUrl) {
    return null;
  }

  return {
    id: att.id,
    fileName: att.fileName,
    fileType: att.fileType,
    fileSize: att.fileSize,
    fileUrl,
    thumbnailUrl,
    createdAt: att.createdAt,
  };
}

async function presignAttachmentsForBroadcast(
  attachments: Pick<
    Attachment,
    "id" | "fileName" | "fileType" | "fileSize" | "fileUrl" | "thumbnailUrl" | "createdAt"
  >[],
  companyId: string
): Promise<BroadcastAttachment[]> {
  const results = await Promise.all(
    attachments.map((att) => presignAttachmentForBroadcast(att, companyId))
  );
  return results.filter((att): att is BroadcastAttachment => att !== null);
}

type UploadResultWithDetected = Attachment & {
  detectedType: "IMAGE" | "FILE";
};

async function presignUploadResultForApiResponse(
  att: UploadResultWithDetected,
  companyId: string
): Promise<BroadcastAttachment | null> {
  const { detectedType: _d, ...rest } = att;
  let fileUrl: string | null = null;
  let thumbnailUrl: string | null = null;

  if (rest.fileUrl && companyId) {
    try {
      fileUrl = await getPresignedUrl(rest.fileUrl, companyId, PRESIGN_TTL_SEC);
    } catch {
      return null;
    }
  }

  if (rest.thumbnailUrl && companyId) {
    try {
      thumbnailUrl = await getPresignedUrl(rest.thumbnailUrl, companyId, PRESIGN_TTL_SEC);
    } catch {
      // optional thumbnail
    }
  }

  if (!fileUrl) {
    return null;
  }

  return {
    id: rest.id,
    fileName: rest.fileName,
    fileType: rest.fileType,
    fileSize: rest.fileSize,
    fileUrl,
    thumbnailUrl,
    createdAt: rest.createdAt,
  };
}

async function presignUploadResultsForApiResponse(
  attachments: UploadResultWithDetected[],
  companyId: string
): Promise<BroadcastAttachment[]> {
  const results = await Promise.all(
    attachments.map((att) => presignUploadResultForApiResponse(att, companyId))
  );
  return results.filter((att): att is BroadcastAttachment => att !== null);
}

function buildUploadResponseData(
  signed: BroadcastAttachment[],
  warnings: string[] | undefined
) {
  const attachments =
    signed.length === 1 ? signed[0] : signed;
  if (warnings && warnings.length > 0) {
    return { attachments, warnings };
  }
  return attachments;
}

async function runPostUploadBroadcast(
  messageId: string,
  companyId: string
): Promise<void> {
  const message = await messageRepository.findById(messageId);
  if (!message) {
    return;
  }

  const chat = await chatRepository.findById(message.chatId, companyId);
  if (!chat) {
    return;
  }

  const allAttachments = await attachmentRepository.findByMessageId(messageId);
  const attachmentsWithUrls = await presignAttachmentsForBroadcast(allAttachments, companyId);

  const io = getIO();
  broadcastMessage(
    io,
    {
      id: message.id,
      chatId: message.chatId,
      senderType: message.senderType,
      text: message.text || "",
      createdAt: message.createdAt,
      attachments: attachmentsWithUrls,
    },
    {
      id: chat.id,
      propertyId: chat.propertyId,
      sessionId: chat.sessionId,
      agentId: chat.agentId,
    },
    {
      includePropertyRoom: message.senderType === "VISITOR",
      includeLegacyEvents: true,
    }
  );
}

export async function uploadAttachmentHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { messageId } = req.body;
  const companyId = req.user!.companyId!;
  const userId = req.user!.id;

  const files = req.files as Express.Multer.File[];
  const file = req.file as Express.Multer.File | undefined;
  const filesToUpload =
    files && Array.isArray(files) ? files : file ? [file] : [];

  const uploadResults = await Promise.allSettled(
    filesToUpload.map((f) =>
      attachmentService.uploadFile(f, messageId, companyId, userId)
    )
  );

  const attachments: UploadResultWithDetected[] = [];
  const errors: string[] = [];

  uploadResults.forEach((result, index) => {
    if (result.status === "fulfilled") {
      attachments.push(result.value);
    } else {
      const fileName =
        filesToUpload[index]?.originalname || `File ${index + 1}`;
      const errorMessage = result.reason?.message || "Upload failed";
      errors.push(`${fileName}: ${errorMessage}`);
    }
  });

  if (attachments.length === 0) {
    return errorResponse(res, {
      message: `All file uploads failed: ${errors.join("; ")}`,
      statusCode: 400,
    });
  }

  const warnings = errors.length > 0 ? errors : undefined;

  const allImages = attachments.every((att) => att.detectedType === "IMAGE");
  const messageType: MessageType = allImages ? MessageType.IMAGE : MessageType.FILE;

  await messageRepository.update(messageId, { messageType });

  try {
    await runPostUploadBroadcast(messageId, companyId);
  } catch {
    // Continue even if broadcast fails
  }

  const signedForResponse = await presignUploadResultsForApiResponse(
    attachments,
    companyId
  );
  const data = buildUploadResponseData(signedForResponse, warnings);

  return successResponse(res, { data, statusCode: 201 });
}

export async function getAttachmentByIdHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { id } = req.params;
  const companyId = req.user!.companyId!;

  const attachment = await attachmentService.getAttachmentById(id, companyId);

  const fileUrl = attachment.fileUrl
    ? await getPresignedUrl(attachment.fileUrl, companyId, PRESIGN_TTL_SEC)
    : null;
  const thumbnailUrl = attachment.thumbnailUrl
    ? await getPresignedUrl(attachment.thumbnailUrl, companyId, PRESIGN_TTL_SEC)
    : null;

  return successResponse(res, {
    data: {
      ...attachment,
      fileUrl,
      thumbnailUrl,
    },
    statusCode: 200,
  });
}

export async function getAttachmentSignedUrlHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const companyId = req.user!.companyId!;

  const parsed = getAttachmentSignedUrlSchema.parse({
    params: req.params,
    query: req.query,
  });
  const expiresIn = parsed.query.expiresIn ?? 3600;

  const signedUrl = await attachmentService.getAttachmentSignedUrl(
    parsed.params.id,
    companyId,
    expiresIn
  );
  return successResponse(res, { data: { url: signedUrl }, statusCode: 200 });
}

export async function getAttachmentsByMessageHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { messageId } = req.params;
  const companyId = req.user!.companyId!;

  const attachments = await attachmentService.getAttachmentsByMessageId(
    messageId,
    companyId
  );

  const attachmentsWithUrls = await Promise.all(
    attachments.map(async (att) => ({
      ...att,
      fileUrl: att.fileUrl
        ? await getPresignedUrl(att.fileUrl, companyId, PRESIGN_TTL_SEC)
        : null,
      thumbnailUrl: att.thumbnailUrl
        ? await getPresignedUrl(att.thumbnailUrl, companyId, PRESIGN_TTL_SEC)
        : null,
    }))
  );

  return successResponse(res, { data: attachmentsWithUrls, statusCode: 200 });
}

export async function getAttachmentsByChatHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { chatId } = req.params;
  const companyId = req.user!.companyId!;

  const attachments = await attachmentService.getAttachmentsByChatId(
    chatId,
    companyId
  );

  const attachmentsWithUrls = await Promise.all(
    attachments.map(async (att) => ({
      ...att,
      fileUrl: att.fileUrl
        ? await getPresignedUrl(att.fileUrl, companyId, PRESIGN_TTL_SEC)
        : null,
      thumbnailUrl: att.thumbnailUrl
        ? await getPresignedUrl(att.thumbnailUrl, companyId, PRESIGN_TTL_SEC)
        : null,
    }))
  );

  return successResponse(res, { data: attachmentsWithUrls, statusCode: 200 });
}

export async function deleteAttachmentHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { id } = req.params;
  const companyId = req.user!.companyId!;

  await attachmentService.deleteAttachment(id, companyId);
  return successResponse(res, { statusCode: 200 });
}

export async function uploadAttachmentVisitorHandler(
  req: Request,
  res: Response
) {
  const { messageId } = req.body;
  const companyId = (req as { companyId?: string }).companyId;

  if (!companyId) {
    return errorResponse(res, { message: "Unauthorized", statusCode: 401 });
  }

  const files = req.files as Express.Multer.File[];
  const file = req.file as Express.Multer.File | undefined;
  const filesToUpload =
    files && Array.isArray(files) ? files : file ? [file] : [];

  const uploadResults = await Promise.allSettled(
    filesToUpload.map((f) =>
      attachmentService.uploadFile(f, messageId, companyId)
    )
  );

  const attachments: UploadResultWithDetected[] = [];
  const errors: string[] = [];

  uploadResults.forEach((result, index) => {
    if (result.status === "fulfilled") {
      attachments.push(result.value);
    } else {
      const fileName =
        filesToUpload[index]?.originalname || `File ${index + 1}`;
      const errorMessage = result.reason?.message || "Upload failed";
      errors.push(`${fileName}: ${errorMessage}`);
    }
  });

  if (attachments.length === 0) {
    return errorResponse(res, {
      message: `All file uploads failed: ${errors.join("; ")}`,
      statusCode: 400,
    });
  }

  const warnings = errors.length > 0 ? errors : undefined;

  const allImages = attachments.every((att) => att.detectedType === "IMAGE");
  const messageType: MessageType = allImages ? MessageType.IMAGE : MessageType.FILE;

  await messageRepository.update(messageId, { messageType });

  try {
    await runPostUploadBroadcast(messageId, companyId);
  } catch {
    // Continue even if broadcast fails
  }

  let deferredBotMessage: Awaited<
    ReturnType<typeof chatLifecycleService.completeVisitorBotReplyAfterAttachmentsUpload>
  > = null;
  try {
    deferredBotMessage =
      await chatLifecycleService.completeVisitorBotReplyAfterAttachmentsUpload({
        messageId,
        companyId,
      });
  } catch {
    // Non-fatal: visitor still has uploaded files
  }

  if (deferredBotMessage) {
    try {
      const um = await messageRepository.findById(messageId);
      if (um) {
        const chat = await chatRepository.findById(um.chatId, companyId);
        if (chat) {
          const io = getIO();
          const botMessageAttachments = await getMessageAttachmentsWithUrls(
            deferredBotMessage.id,
            companyId
          );
          broadcastMessage(
            io,
            {
              id: deferredBotMessage.id,
              chatId: deferredBotMessage.chatId,
              senderType: deferredBotMessage.senderType,
              text: deferredBotMessage.text,
              createdAt: deferredBotMessage.createdAt,
              attachments: botMessageAttachments,
              quickReplies: deferredBotMessage.quickReplies,
            },
            {
              id: chat.id,
              propertyId: chat.propertyId,
              sessionId: chat.sessionId,
              agentId: chat.agentId,
            },
            {
              includePropertyRoom: false,
              includeLegacyEvents: true,
            }
          );
        }
      }
    } catch {
      // ignore broadcast failures
    }
  }

  const signedForResponse = await presignUploadResultsForApiResponse(
    attachments,
    companyId
  );
  const data = buildUploadResponseData(signedForResponse, warnings);

  return successResponse(res, { data, statusCode: 201 });
}
