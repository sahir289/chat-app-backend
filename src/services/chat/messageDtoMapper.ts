import { getPresignedUrl } from "../s3Service";
import type { MessageDTO, SenderKind } from "../../types/chat";

type MessageWithRelations = {
    id: string;
    chatId: string;
    senderType: string;
    text: string | null;
    createdAt: Date;
    metadata: unknown;
    messageButtons?: Array<{
        id: string;
        label: string;
        value: string;
        type: string;
        url: string | null;
        payload: string | null;
        order: number;
    }>;
    attachments?: Array<{
        id: string;
        fileName: string;
        fileType: string;
        fileSize: number;
        fileUrl: string | null;
        thumbnailUrl: string | null;
        createdAt: Date;
    }>;
};

export async function mapMessageToDto(
    message: MessageWithRelations,
    companyId: string
): Promise<MessageDTO> {
    let parsedMetadata: Record<string, unknown> | null = null;
    if (message.metadata) {
        if (typeof message.metadata === "string") {
            try {
                parsedMetadata = JSON.parse(message.metadata) as Record<string, unknown>;
            } catch {
                parsedMetadata = null;
            }
        } else {
            parsedMetadata = message.metadata as Record<string, unknown>;
        }
    }

    const buttons = (message.messageButtons || []).map((btn) => ({
        id: btn.id,
        label: btn.label,
        value: btn.value,
        type: btn.type,
        url: btn.url,
        payload: btn.payload,
        order: btn.order,
    }));

    return {
        id: message.id,
        chatId: message.chatId,
        senderType: message.senderType as SenderKind,
        text: message.text || "",
        createdAt: message.createdAt,
        metadata: parsedMetadata,
        buttons: buttons.length > 0 ? buttons : undefined,
        attachments: await Promise.all(
            (message.attachments || []).map(async (att) => {
                let fileUrl: string | null = null;
                let thumbnailUrl: string | null = null;

                if (att.fileUrl && companyId) {
                    try {
                        fileUrl = await getPresignedUrl(att.fileUrl, companyId, 3600);
                    } catch {
                        // Presigned URL generation failed — attachment metadata is still returned.
                    }
                }

                if (att.thumbnailUrl && companyId) {
                    try {
                        thumbnailUrl = await getPresignedUrl(att.thumbnailUrl, companyId, 3600);
                    } catch {
                        // Presigned URL generation failed — attachment metadata is still returned.
                    }
                }

                return {
                    id: att.id,
                    fileName: att.fileName,
                    fileType: att.fileType,
                    fileSize: att.fileSize,
                    fileUrl: fileUrl ?? "",
                    thumbnailUrl,
                    createdAt: att.createdAt,
                };
            })
        ),
    };
}
