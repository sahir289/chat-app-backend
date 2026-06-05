export const SOCKET_EVENTS = {

    VISITOR_CONNECT: "visitor:connect",
    AGENT_CONNECT: "agent:connect",
    CHAT_JOIN: "chat:join",
    CHAT_LEAVE: "chat:leave",
    CHAT_MESSAGE: "chat:message",
    VISITOR_SEND_MESSAGE: "visitor:send_message",
    AGENT_SEND_MESSAGE: "agent:send_message",
    VISITOR_TYPING: "visitor:typing",
    AGENT_TYPING: "agent:typing",
    CHAT_TYPING: "chat:typing",
    VISITOR_END_CHAT: "visitor:end_chat",
    AGENT_JOIN_CHAT: "agent:join_chat",
    AGENT_ASSIGN_CHAT: "agent:assign_chat",
    CHAT_CLOSE: "chat:close",

    CHAT_JOINED: "chat:joined",
    CHAT_ERROR: "chat:error",
    VISITOR_MESSAGE: "visitor_message",
    AGENT_MESSAGE: "agent_message",
    CHAT_UPDATED: "chat:updated",
    CHAT_NEW: "chat:new",
    CHAT_CLOSED: "chat:closed",
    CHAT_ASSIGNED: "chat_assigned",
    CHAT_ASSIGNED_LEGACY: "chat:assigned",
    VISITOR_STATUS: "visitor:status",
    AGENT_AVAILABILITY: "agent:availability",

    // Message edit events
    MESSAGE_EDIT: "message:edit",
    MESSAGE_EDITED: "message:edited",

    // Company events
    COMPANY_PRO_STATUS_UPDATED: "company:pro_status_updated",
    COMPANY_OPENAI_MODELS_UPDATED: "company:openai_models_updated",
    UPGRADE_REQUEST_UPDATED: "upgrade_request:updated",
    AI_CREDITS_UPDATED: "ai_credits:updated",

    // Unread count events
    UNREAD_COUNT_UPDATED: "unread:count_updated",
    UNREAD_COUNTS_SYNC: "unread:counts_sync",

    // Visitor events
    VISITOR_UPDATED: "visitor:updated",
} as const;

