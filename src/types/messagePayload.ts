export interface MessagePayload {
    text: string;
    chatId?: string;
    senderType?: "VISITOR" | "BOT" | "AGENT";
}