import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { validate } from "../middlewares/validationMiddleware";
import { startChatHandler, postMessageHandler } from "../controllers/chatController";
import { postChatMessageSchema, startChatSchema } from "../validations/chatValidation";

const router = Router();

router.post("/start",
     validate(startChatSchema),
      asyncHandler(startChatHandler)
    );

router.post(
    "/message",
    validate(postChatMessageSchema),
    asyncHandler(postMessageHandler)
);

export default router;


