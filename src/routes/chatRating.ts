import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { authMiddleware, tenantMiddleware } from "../middlewares/authMiddleware";
import { requireModule } from "../middlewares/moduleAccessMiddleware";
import { validate } from "../middlewares/validationMiddleware";
import {
  createRatingHandler,
  getRatingHandler,
  listRatingsHandler,
  getAverageRatingHandler,
  deleteRatingHandler,
} from "../controllers/chatRatingController";
import {
  averageRatingSchema,
  createRatingSchema,
  deleteRatingSchema,
  getRatingSchema,
  listRatingsSchema,
} from "../validations/chatRatingValidation";

const router = Router();

router.post(
  "/chats/:chatId/rating",
  authMiddleware,
  tenantMiddleware,
  requireModule("chat_ratings"),
  validate(createRatingSchema),
  asyncHandler(createRatingHandler)
);
router.get(
  "/chats/:chatId/rating",
  authMiddleware,
  tenantMiddleware,
  requireModule("chat_ratings"),
  validate(getRatingSchema),
  asyncHandler(getRatingHandler)
);
router.delete(
  "/chats/:chatId/rating",
  authMiddleware,
  tenantMiddleware,
  requireModule("chat_ratings"),
  validate(deleteRatingSchema),
  asyncHandler(deleteRatingHandler)
);
router.get(
  "/ratings",
  authMiddleware,
  tenantMiddleware,
  requireModule("chat_ratings"),
  validate(listRatingsSchema),
  asyncHandler(listRatingsHandler)
);
router.get(
  "/ratings/average",
  authMiddleware,
  tenantMiddleware,
  requireModule("chat_ratings"),
  validate(averageRatingSchema),
  asyncHandler(getAverageRatingHandler)
);

export default router;

