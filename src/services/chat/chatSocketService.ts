import type { ChatSocketContext, MessageDTO } from "../../types/chat";
import { SOCKET_EVENTS } from "../../socket/events";
import { getIO, broadcastMessage, getChatRoom, getPropertyRoom } from "../../socket/index";
import { getChatRoom as getChatRoomHelper } from "../../socket/helpers";
export type { ChatSocketContext } from "../../types/chat";

export const chatSocketService = {
    async emitAiTypingIndicator(chatId: string, isTyping: boolean, logPrefix: string): Promise<void> {
        try {
            const io = getIO();
            const chatRoom = getChatRoomHelper(chatId);

            io.to(chatRoom).emit("chat:typing", {
                chatId,
                isTyping,
                socketId: "ai-bot",
                senderType: "BOT",
            });
        } catch (error_) {
        }
    },

    async broadcastBotMessage(message: MessageDTO, chat: ChatSocketContext, logPrefix: string): Promise<void> {
        try {
            const io = getIO();

            broadcastMessage(io, message, chat, {
                includePropertyRoom: false,
                includeLegacyEvents: true,
            });
        } catch (error_) {
        }
    },

    async emitChatReopened(chatId: string, propertyId: string, logPrefix: string): Promise<void> {
        try {
            const io = getIO();
            io.to(getChatRoom(chatId)).emit("chat:reopened", { chatId });
            io.to(getPropertyRoom(propertyId)).emit("chat:updated", { chatId });
        } catch (error_) {
        }
    },

    async emitChatNew(chatId: string, propertyId: string, logPrefix: string): Promise<void> {
        try {
            const io = getIO();
            io.to(getPropertyRoom(propertyId)).emit(SOCKET_EVENTS.CHAT_NEW, { chatId });
        } catch (error_) {
        }
    },

    async emitChatClosed(chatId: string, logPrefix: string): Promise<void> {
        try {
            const io = getIO();
            io.to(getChatRoom(chatId)).emit("chat:closed", { chatId });
        } catch (error_) {
        }
    },
};
