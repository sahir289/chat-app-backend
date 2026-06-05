import prisma from "../lib/prisma";
import type { Attachment } from "@prisma/client";

export const attachmentRepository = {
  async findByMessageId(messageId: string): Promise<Attachment[]> {
    return prisma.attachment.findMany({
      where: { messageId },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async findById(id: string): Promise<(Attachment & { message: { id: string; chatId: string; chat: { companyId: string } | null } | null }) | null> {
    const attachment = await prisma.attachment.findUnique({
      where: { id },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        message: {
          select: {
            id: true,
            chatId: true,
          },
        },
      },
    });

    if (!attachment || !attachment.message) return attachment as any;

    const chat = await prisma.chat.findUnique({
      where: { id: attachment.message.chatId },
      select: {
        companyId: true,
      },
    });

    return {
      ...attachment,
      message: {
        ...attachment.message,
        chat: chat ? { companyId: chat.companyId } : null,
      },
    } as any;
  },

  async create(data: {
    messageId: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    fileUrl: string;
    thumbnailUrl?: string | null;
    uploadedById?: string | null;
  }): Promise<Attachment> {
    return prisma.attachment.create({
      data,
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  },

  async delete(id: string): Promise<void> {
    await prisma.attachment.delete({
      where: { id },
    });
  },

  async listByChatId(chatId: string): Promise<Attachment[]> {
    return prisma.attachment.findMany({
      where: {
        message: {
          chatId,
        },
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  },
};

