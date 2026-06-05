import type { Request, Response } from "express";
import { SenderType } from "@prisma/client";
import { chatService } from "../services/chatService";
import { getIO, broadcastMessage, isChatActivelyViewedByAgent } from "../socket/index";
import { chatRepository } from "../repositories/chatRepository";
import { successResponse } from "../utils/apiResponse";
import { emitUnreadUpdate } from "../socket/unreadEvents";
import {
    buildVisitorInfo,
    getMessageAttachmentsWithUrls,
} from "../helpers/chat/chatRequestHelpers";

export async function startChatHandler(
    req: Request,
    res: Response
) {
    const { widgetKey, sessionId } = req.body ?? {};

    const visitorInfo = await buildVisitorInfo(
        req,
        (req.body ?? {}) as Record<string, unknown>
    );
    const data = await chatService.startChat({
        widgetKey,
        sessionId,
        visitorInfo,
    });
    return successResponse(res, { statusCode: 201, data });
}

export async function postMessageHandler(
    req: Request,
    res: Response
) {
    const {
        chatId,
        widgetKey,
        sessionId,
        text,
        section,
        metadata,
        deferAiReply,
        clientMessageId,
    } = req.body ?? {};

    let visitorInfo:
        | Awaited<ReturnType<typeof buildVisitorInfo>>
        | undefined;

    if (widgetKey && sessionId) {
        visitorInfo = await buildVisitorInfo(
            req,
            (req.body ?? {}) as Record<string, unknown>
        );
    }

    const io = getIO();
    /** Public HTTP route: never trust client senderType; only the widget may use this endpoint. */
    const effectiveSenderType: SenderType = SenderType.VISITOR;
    const suppressUnreadIncrement =
        typeof chatId === "string"
            ? await isChatActivelyViewedByAgent(chatId, io)
            : false;

    const data = await chatService.addMessage({
        chatId: chatId || undefined,
        widgetKey: widgetKey || undefined,
        sessionId: sessionId || undefined,
        text,
        senderType: effectiveSenderType,
        section,
        suppressUnreadIncrement,
        visitorInfo,
        metadata,
        deferAiReply: deferAiReply === true,
        clientMessageId:
            typeof clientMessageId === "string" ? clientMessageId : undefined,
    });

    // If lead info is needed, include it in response
    if (data.needsLeadInfo) {
        return successResponse(res, {
            statusCode: 201,
            data: {
                ...data,
                needsLeadInfo: true,
            },
        });
    }

    // Broadcast to socket.io rooms for real-time updates using shared utility
    // Use data.chatId instead of chatId (which may be undefined in lazy creation mode)
    const effectiveChatId = data.chatId || chatId;
    if (!effectiveChatId) {
        // This should not happen, but handle gracefully
        return successResponse(res, { statusCode: 201, data });
    }

    const chat = await chatRepository.findById(effectiveChatId);
    if (chat && !data.duplicate) {
        const userMessageAttachments =
            await getMessageAttachmentsWithUrls(
                data.userMessage.id,
                chat.companyId
            );

        // Broadcast user message
        broadcastMessage(
            io,
            {
                id: data.userMessage.id,
                chatId: data.userMessage.chatId,
                senderType: data.userMessage.senderType,
                text: data.userMessage.text,
                createdAt: data.userMessage.createdAt,
                clientMessageId: data.userMessage.clientMessageId,
                replyToClientMessageId: data.userMessage.replyToClientMessageId,
                attachments: userMessageAttachments,
            },
            {
                id: chat.id,
                propertyId: chat.propertyId,
                sessionId: chat.sessionId,
                agentId: chat.agentId,
            },
            {
                includePropertyRoom: true,
                includeLegacyEvents: true,
            }
        );

        if (data.userMessage.senderType === SenderType.VISITOR) {
            await emitUnreadUpdate(io, chat.id, chat.companyId, {
                id: data.userMessage.id,
                text: data.userMessage.text,
                senderType: data.userMessage.senderType,
                createdAt: data.userMessage.createdAt,
            });
        }

        // Broadcast bot message if exists
        if (data.botMessage) {
            const botMessageAttachments =
                await getMessageAttachmentsWithUrls(
                    data.botMessage.id,
                    chat.companyId
                );

            broadcastMessage(
                io,
                {
                    id: data.botMessage.id,
                    chatId: data.botMessage.chatId,
                    senderType: data.botMessage.senderType,
                    text: data.botMessage.text,
                    createdAt: data.botMessage.createdAt,
                    clientMessageId: data.botMessage.clientMessageId,
                    replyToClientMessageId: data.botMessage.replyToClientMessageId,
                    attachments: botMessageAttachments,
                    quickReplies: data.botMessage.quickReplies,
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

    return successResponse(res, { statusCode: 201, data });
}
