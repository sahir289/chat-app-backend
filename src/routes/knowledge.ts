import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { authMiddleware, tenantMiddleware } from "../middlewares/authMiddleware";
import { requireModule } from "../middlewares/moduleAccessMiddleware";
import { validate } from "../middlewares/validationMiddleware";
import { createSourceSchema } from "../validations/knowledgeValidation";
import {
  createSourceHandler,
  listSourcesHandler,
  getSourceHandler,
  updateSourceHandler,
  deleteSourceHandler,
  reprocessSourceHandler,
  createChunkHandler,
  getSourceChunksHandler,
  searchChunksHandler,
  extractPdfTextHandler,
} from "../controllers/knowledgeController";

const router = Router();

router.post("/pdf/extract",
  authMiddleware,
  requireModule("knowledge_base"),
  ...extractPdfTextHandler);

router.post("/sources", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("knowledge_base"), 
  validate(createSourceSchema), 
  asyncHandler(createSourceHandler));

router.get("/sources", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("knowledge_base"), 
  asyncHandler(listSourcesHandler));

router.get("/sources/:sourceId", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("knowledge_base"), 
  asyncHandler(getSourceHandler));

router.patch("/sources/:sourceId", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("knowledge_base"), 
  asyncHandler(updateSourceHandler));

router.post("/sources/:sourceId/reprocess", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("knowledge_base"), 
  asyncHandler(reprocessSourceHandler));

router.delete("/sources/:sourceId", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("knowledge_base"), 
  asyncHandler(deleteSourceHandler));

router.post("/chunks", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("knowledge_base"), 
  asyncHandler(createChunkHandler));

router.get("/sources/:sourceId/chunks", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("knowledge_base"), 
  asyncHandler(getSourceChunksHandler));

router.post("/search", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("knowledge_base"), 
  asyncHandler(searchChunksHandler));

export default router;

