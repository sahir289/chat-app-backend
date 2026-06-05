import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { verifyWidgetHandler } from "../widget";
import {
    getWidgetInitHandler,
    postWidgetEventHandler,
    postWidgetStartHandler,
    postWidgetMessageHandler,
    getAgentAvailabilityHandler,
    postWidgetCloseIntentHandler,
    getWidgetChatsHandler,
    getWidgetChatMessagesHandler,
} from "../controllers/widgetController";
import { editWidgetMessageHandler } from "../controllers/messagesController";
import {
    createVisitorRatingHandler,
    getVisitorRatingHandler,
} from "../controllers/chatRatingController";
import { validate } from "../middlewares/validationMiddleware";
import {
    createVisitorRatingSchema,
    getVisitorRatingSchema,
} from "../validations/chatRatingValidation";
import {
    widgetKeyQuerySchema,
    widgetEventSchema,
    widgetStartSchema,
    widgetMessageSchema,
    widgetCloseIntentSchema,
    widgetChatsSessionQuerySchema,
    widgetChatMessagesQuerySchema,
} from "../validations/widgetValidation";
import {
    widgetIPRateLimit,
    widgetSessionRateLimit,
    widgetEventRateLimit,
    widgetMessageRateLimit,
} from "../middlewares/rateLimitMiddleware";

const router = Router();

router.get(
    "/verify",
    asyncHandler(verifyWidgetHandler)
);

router.get(
    "/init",
    widgetIPRateLimit,
    validate(widgetKeyQuerySchema),
    asyncHandler(getWidgetInitHandler)
);

router.get(
    "/agent-availability",
    widgetIPRateLimit,
    validate(widgetKeyQuerySchema),
    asyncHandler(getAgentAvailabilityHandler)
);

router.post(
    "/event",
    widgetIPRateLimit,
    widgetEventRateLimit,
    validate(widgetEventSchema),
    asyncHandler(postWidgetEventHandler)
);

router.post(
    "/start",
    widgetIPRateLimit,
    widgetSessionRateLimit,
    validate(widgetStartSchema),
    asyncHandler(postWidgetStartHandler)
);

router.get(
    "/chats",
    widgetIPRateLimit,
    validate(widgetChatsSessionQuerySchema),
    asyncHandler(getWidgetChatsHandler)
);

router.get(
    "/chats/:chatId/messages",
    widgetIPRateLimit,
    validate(widgetChatMessagesQuerySchema),
    asyncHandler(getWidgetChatMessagesHandler)
);

router.post(
    "/message",
    widgetIPRateLimit,
    widgetMessageRateLimit,
    validate(widgetMessageSchema),
    asyncHandler(postWidgetMessageHandler)
);

// Visitor rating endpoints (no auth required, validates via sessionId)
router.post(
    "/chats/:chatId/rating",
    widgetIPRateLimit,
    validate(createVisitorRatingSchema),
    asyncHandler(createVisitorRatingHandler)
);

router.get(
    "/chats/:chatId/rating",
    widgetIPRateLimit,
    validate(getVisitorRatingSchema),
    asyncHandler(getVisitorRatingHandler)
);

router.post(
    "/chats/:chatId/close-intent",
    widgetIPRateLimit,
    validate(widgetCloseIntentSchema),
    asyncHandler(postWidgetCloseIntentHandler)
);

// Widget message edit endpoint (no auth required, validates via sessionId)
router.patch(
    "/messages/:messageId/edit",
    widgetIPRateLimit,
    asyncHandler(editWidgetMessageHandler)
);

export default router;
