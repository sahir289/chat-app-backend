import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { authMiddleware, tenantMiddleware } from "../middlewares/authMiddleware";
import { adminOnly } from "../middlewares/roleMiddleware";
import {
  listUsersHandler,
  getUserHandler,
  createUserHandler,
  updateUserHandler,
  deleteUserHandler,
  activateUserHandler,
  updateUserSettingsHandler,
} from "../controllers/usersController";

const router = Router();

router.get("/", 
  authMiddleware, 
  tenantMiddleware, 
  adminOnly, 
  asyncHandler(listUsersHandler));

router.post("/", 
  authMiddleware, 
  tenantMiddleware, 
  adminOnly, 
  asyncHandler(createUserHandler));

router.patch("/settings", 
  authMiddleware, 
  tenantMiddleware, 
  asyncHandler(updateUserSettingsHandler));

router.get("/:id", 
  authMiddleware, 
  tenantMiddleware, 
  adminOnly, 
  asyncHandler(getUserHandler));

router.patch("/:id", 
  authMiddleware, 
  tenantMiddleware, 
  asyncHandler(updateUserHandler));

router.delete("/:id", 
  authMiddleware, 
  tenantMiddleware, 
  adminOnly, 
  asyncHandler(deleteUserHandler));

router.patch("/:id/activate", 
  authMiddleware, 
  tenantMiddleware, 
  adminOnly, 
  asyncHandler(activateUserHandler));

export default router;

