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

export async function consumeSocketChatMessageBudget(socketId: string): Promise<boolean> {
    const { allowed } = await checkRateLimit(
        `socket:event:chat_message:${socketId}`,
        MESSAGE_WINDOW_MS,
        MESSAGE_MAX_PER_WINDOW
    );
    return allowed;
}

export async function consumeSocketMessageEditBudget(socketId: string): Promise<boolean> {
    const { allowed } = await checkRateLimit(
        `socket:event:message_edit:${socketId}`,
        EDIT_WINDOW_MS,
        EDIT_MAX_PER_WINDOW
    );
    return allowed;
}
