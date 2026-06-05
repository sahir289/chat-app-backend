export interface JoinPayload {
    chatId?: string;
    propertyId?: string;
    widgetKey?: string;
    sessionId?: string;
    role?: "visitor" | "agent" | "dashboard";
    url?: string | null;
    referrer?: string | null;
    userAgent?: string | null;
    device?: string | null;
    browser?: string | null;
    country?: string | null;
    ipAddress?: string | null;
}