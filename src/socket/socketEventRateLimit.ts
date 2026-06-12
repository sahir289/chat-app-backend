import { checkRateLimit } from "../middlewares/rateLimitMiddleware";

const TYPING_WINDOW_MS = 60_000;
const TYPING_MAX_PER_WINDOW = 120;

const MESSAGE_WINDOW_MS = 60_000;
const MESSAGE_MAX_PER_WINDOW = 60;

const EDIT_WINDOW_MS = 60_000;
const EDIT_MAX_PER_WINDOW = 40;

export async function consumeSocketTypingBudget(socketId: string): Promise<boolean> {
    const { allowed } = await checkRateLimit(
        `socket:event:typing:${socketId}`,
        TYPING_WINDOW_MS,
        TYPING_MAX_PER_WINDOW
    );
    return allowed;
}

type SocketMessageRateLimitScope = {
    sessionId?: string | null;
    chatId?: string | null;
};

function getSocketChatMessageRateLimitKey(
    socketId: string,
    scope?: SocketMessageRateLimitScope
): string {
    if (scope?.chatId) {
        return `socket:event:chat_message:chat:${scope.chatId}`;
    }
    if (scope?.sessionId) {
        return `socket:event:chat_message:session:${scope.sessionId}`;
    }
    return `socket:event:chat_message:socket:${socketId}`;
}

export async function consumeSocketChatMessageBudget(
    socketId: string,
    scope?: SocketMessageRateLimitScope
): Promise<{ allowed: boolean; retryAfter?: number }> {
    return checkRateLimit(
        getSocketChatMessageRateLimitKey(socketId, scope),
        MESSAGE_WINDOW_MS,
        MESSAGE_MAX_PER_WINDOW
    );
}

export async function consumeSocketMessageEditBudget(socketId: string): Promise<boolean> {
    const { allowed } = await checkRateLimit(
        `socket:event:message_edit:${socketId}`,
        EDIT_WINDOW_MS,
        EDIT_MAX_PER_WINDOW
    );
    return allowed;
}
