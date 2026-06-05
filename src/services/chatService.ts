import { chatAutoReplyService } from "./chat/chatAutoReplyService";
import { chatLifecycleService } from "./chat/chatLifecycleService";
import { chatQueryService } from "./chat/chatQueryService";

export const chatService = {
    ...chatLifecycleService,
    ...chatQueryService,
    getNonAiResponse: chatAutoReplyService.getNonAiResponse,
};
