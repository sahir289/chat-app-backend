import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import {
  inviteAgentHandler,
  deactivateAgentHandler,
  getAgentAccessHandler,
  updateAgentAccessHandler,
  getMyAccessHandler,
} from "../controllers/teamController";
import { authMiddleware, tenantMiddleware } from "../middlewares/authMiddleware";
import { requireRole } from "../middlewares/roleMiddleware";
import { requireModule } from "../middlewares/moduleAccessMiddleware";
import { Role } from "@prisma/client";

const router = Router();

router.get("/my-access", 
  authMiddleware, 
  tenantMiddleware,
  requireRole(Role.AGENT), 
  asyncHandler(getMyAccessHandler));

router.post("/invite", 
  authMiddleware, 
  tenantMiddleware,
  requireModule("team"), 
  requireRole(Role.ADMIN), 
  asyncHandler(inviteAgentHandler));

router.post("/:id/deactivate", 
  authMiddleware, 
  tenantMiddleware,
  requireModule("team"), 
  requireRole(Role.ADMIN), 
  asyncHandler(deactivateAgentHandler));

router.get("/:id/access", 
  authMiddleware, 
  tenantMiddleware,
  requireModule("team"), 
  requireRole(Role.ADMIN), 
  asyncHandler(getAgentAccessHandler));

router.patch("/:id/access", 
  authMiddleware, 
  tenantMiddleware,
  requireModule("team"), 
  requireRole(Role.ADMIN), 
  asyncHandler(updateAgentAccessHandler));

export default router;

