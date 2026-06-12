import { getClosingMessage } from "../../utils/closingIntentDetection";

export function buildReopenChatData(): { status: "ACTIVE"; closedAt: null } {
    return {
        status: "ACTIVE",
        closedAt: null,
    };
}

export function shouldRequestLeadInfo(leadExists: boolean): boolean {
    return !leadExists;
}

export function appendClosingMessageIfNeeded(replyText: string, hasClosingIntent: boolean): string {
    const trimmed = replyText.trim();
    if (!trimmed) {
        return "";
    }

    if (!hasClosingIntent) {
        return trimmed;
    }

    return `${trimmed}\n\n${getClosingMessage()}`;
}

export function shouldCloseChatFromIntent(_hasClosingIntent: boolean, _chatStatus: string): boolean {
    return false;
}
