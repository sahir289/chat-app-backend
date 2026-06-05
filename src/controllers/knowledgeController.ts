import type { Request, Response } from "express";
import { knowledgeService } from "../services/knowledgeService";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { assertTenantPropertyAndAgentAccess } from "../middlewares/propertyScopeMiddleware";
import { companyService } from "../services/companyService";
import { knowledgeRepository } from "../repositories/knowledgeRepository";
import { extractTextFromPDF } from "../utils/pdfExtractor";
import { uploadMiddleware } from "../middlewares/uploadMiddleware";
import { asyncHandler } from "../middlewares/asyncHandler";
import { errorResponse, successResponse } from "../utils/apiResponse";
export async function createTextSourceHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { propertyId, title, content } = req.body;
  if (!propertyId || !title || !content) {
    return errorResponse(res, { message: "propertyId, title, and content are required", statusCode: 400 });
  }

  const companyId = req.user?.companyId;
  if (!companyId) return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });

  await assertTenantPropertyAndAgentAccess(companyId, req.user?.id, propertyId);

  // Check company Pro status for resource limits
  const company = await companyService.getById(companyId);
  const isPro = company.isPro || false;

  if (!isPro) {
    return errorResponse(res, { message: "AI training is available on Pro plan only. Please upgrade to Pro.", statusCode: 403 });
  }

  const source = await knowledgeService.createTextSource({
    companyId,
    propertyId,
    title,
    content,
  });

  return successResponse(res, { data: source, statusCode: 201 });
}

export async function createUrlSourceHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { propertyId, url } = req.body;
  if (!propertyId || !url) {
    return errorResponse(res, { message: "propertyId and url are required", statusCode: 400 });
  }

  const companyId = req.user?.companyId;
  if (!companyId) return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });

  await assertTenantPropertyAndAgentAccess(companyId, req.user?.id, propertyId);

  // Check company Pro status for URL limits
  const company = await companyService.getById(companyId);
  const isPro = company.isPro || false;

  if (!isPro) {
    return errorResponse(res, { message: "AI training is available on Pro plan only. Please upgrade to Pro.", statusCode: 403 });
  }

  const source = await knowledgeService.createUrlSource({
    companyId,
    propertyId,
    url,
  });

  return successResponse(res, { data: source, statusCode: 201 });
}

export const extractPdfTextHandler = [
  uploadMiddleware.pdfs.single("file"),
  asyncHandler(async (req: Request, res: Response) => {
    const file = req.file;

    if (!file) {
      return errorResponse(res, { message: "PDF file is required", statusCode: 400 });
    }

    // Validate file type
    if (file.mimetype !== "application/pdf") {
      return errorResponse(res, { message: "Only PDF files are allowed", statusCode: 400 });
    }

    // Validate file size (2MB max)
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      return errorResponse(res, { message: "PDF file size must not exceed 2MB", statusCode: 400 });
    }

    // Validate file name
    if (!file.originalname || file.originalname.trim().length === 0) {
      return errorResponse(res, { message: "PDF file name is required", statusCode: 400 });
    }

    // Validate file extension
    if (!file.originalname.toLowerCase().endsWith(".pdf")) {
      return errorResponse(res, { message: "File must have a .pdf extension", statusCode: 400 });
    }

    // Validate file buffer is not empty
    if (!file.buffer || file.buffer.length === 0) {
      return errorResponse(res, { message: "PDF file is empty or corrupted", statusCode: 400 });
    }

    const extractedText = await extractTextFromPDF(file.buffer, file.originalname);

    return successResponse(res, { data: { text: extractedText, fileName: file.originalname } });
  }),
];

export const createPdfSourceHandler = [
  uploadMiddleware.pdfs.single("file"),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { propertyId } = req.body;
    const file = req.file;

    if (!propertyId) {
      return errorResponse(res, { message: "propertyId is required", statusCode: 400 });
    }

    if (!file) {
      return errorResponse(res, { message: "PDF file is required", statusCode: 400 });
    }

    const companyId = (req as AuthenticatedRequest).user?.companyId;
    if (!companyId) return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });
    await assertTenantPropertyAndAgentAccess(companyId, (req as AuthenticatedRequest).user?.id, propertyId);

    // Check company Pro status - FREE users cannot upload PDFs
    const company = await companyService.getById(companyId);
    const isPro = company.isPro || false;

    if (!isPro) {
      return errorResponse(res, { message: "AI training is available on Pro plan only. Please upgrade to Pro.", statusCode: 403 });
    }

    const source = await knowledgeService.createPdfSource({
      companyId,
      propertyId,
      fileName: file.originalname,
      fileBuffer: file.buffer,
    });

    return successResponse(res, { data: source, statusCode: 201 });
  }),
];

export async function getSourcesByPropertyHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { propertyId } = req.query;
  if (!propertyId || typeof propertyId !== "string") {
    return errorResponse(res, { message: "propertyId is required", statusCode: 400 });
  }

  const companyId = req.user?.companyId;
  if (!companyId) return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });

  await assertTenantPropertyAndAgentAccess(companyId, req.user?.id, propertyId);

  const sources = await knowledgeService.getSourcesByProperty(propertyId, companyId);
  return successResponse(res, { data: sources, statusCode: 200 });
}

export async function reprocessSourceHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { sourceId } = req.params;
  if (!sourceId) {
    return errorResponse(res, { message: "sourceId is required", statusCode: 400 });
  }

  const companyId = req.user?.companyId;
  if (!companyId) return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });

  const source = await knowledgeRepository.findSourceById(sourceId);
  if (!source) {
    return errorResponse(res, { message: "Source not found", statusCode: 404 });
  }

  if (source.companyId !== companyId) {
    return errorResponse(res, { message: "Source not found", statusCode: 404 });
  }

  await assertTenantPropertyAndAgentAccess(companyId, req.user?.id, source.propertyId);

  await knowledgeService.reprocessSource(sourceId);
  return successResponse(res, { message: "Source reprocessing started", statusCode: 200 });
}

export async function deleteSourceHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { sourceId } = req.params;
  if (!sourceId) {
    return errorResponse(res, { message: "sourceId is required", statusCode: 400 });
  }

  const companyId = req.user?.companyId;
  if (!companyId) return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });

  const source = await knowledgeRepository.findSourceById(sourceId);
  if (!source) {
    return errorResponse(res, { message: "Source not found", statusCode: 404 });
  }

  if (source.companyId !== companyId) {
    return errorResponse(res, { message: "Source not found", statusCode: 404 });
  }

  await assertTenantPropertyAndAgentAccess(companyId, req.user?.id, source.propertyId);

  await knowledgeService.deleteSource(sourceId);
  return successResponse(res, { message: "Source deleted", statusCode: 200 });
}

export async function createSourceHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  // Validation is handled by schema middleware, so we can trust the data structure
  const { propertyId, sourceType, title, content, url, file } = req.body;

  const companyId = req.user?.companyId;
  if (!companyId) return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });

  await assertTenantPropertyAndAgentAccess(companyId, req.user?.id, propertyId);

  // Check company Pro status for resource limits
  const company = await companyService.getById(companyId);
  const isPro = company.isPro || false;

  if (!isPro) {
    return errorResponse(res, { message: "AI training is available on Pro plan only. Please upgrade to Pro.", statusCode: 403 });
  }

  let source;
  if (sourceType === "TEXT") {
    // Content validation is handled by schema, but we keep this for type safety
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return errorResponse(res, { message: "content is required for TEXT source", statusCode: 400 });
    }

    // Title validation is handled by schema, but we keep this for type safety
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return errorResponse(res, { message: "title is required for TEXT source", statusCode: 400 });
    }

    source = await knowledgeService.createTextSource({ companyId, propertyId, title, content });
  } else if (sourceType === "URL") {
    // URL validation is handled by schema, but we keep this for type safety
    if (!url || typeof url !== "string" || url.trim().length === 0) {
      return errorResponse(res, { message: "url is required for URL source", statusCode: 400 });
    }

    source = await knowledgeService.createUrlSource({ companyId, propertyId, url });
  } else if (sourceType === "FILE") {
    return errorResponse(res, { message: "Use POST /api/knowledge/sources with multipart/form-data for file uploads", statusCode: 400 });
  } else {
    // This should not happen due to schema validation, but kept as safety net
    return errorResponse(res, { message: "Invalid sourceType. Must be TEXT, URL, or FILE", statusCode: 400 });
  }

  return successResponse(res, { data: source, statusCode: 201 });
}

export async function listSourcesHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { propertyId } = req.query;
  if (!propertyId || typeof propertyId !== "string") {
    return errorResponse(res, { message: "propertyId is required", statusCode: 400 });
  }

  const companyId = req.user?.companyId;
  if (!companyId) return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });

  await assertTenantPropertyAndAgentAccess(companyId, req.user?.id, propertyId);

  const sources = await knowledgeService.getSourcesByProperty(propertyId, companyId);
  return successResponse(res, { data: sources, statusCode: 200 });
}

export async function getSourceHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { sourceId } = req.params;
  const id = sourceId;
  const companyId = req.user?.companyId;
  if (!companyId) return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });

  const source = await knowledgeRepository.findSourceById(id);
  if (!source) {
    return errorResponse(res, { message: "Source not found", statusCode: 404 });
  }

  if (source.companyId !== companyId) {
    return errorResponse(res, { message: "Source not found", statusCode: 404 });
  }

  await assertTenantPropertyAndAgentAccess(companyId, req.user?.id, source.propertyId);

  return successResponse(res, { data: source, statusCode: 200 });
}

export async function updateSourceHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { sourceId } = req.params;
  const id = sourceId;
  const { title, content, url } = req.body;
  const companyId = req.user?.companyId;
  if (!companyId) return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });

  const source = await knowledgeRepository.findSourceById(id);
  if (!source) {
    return errorResponse(res, { message: "Source not found", statusCode: 404 });
  }

  if (source.companyId !== companyId) {
    return errorResponse(res, { message: "Source not found", statusCode: 404 });
  }

  await assertTenantPropertyAndAgentAccess(companyId, req.user?.id, source.propertyId);

  const updated = await knowledgeRepository.updateSource(id, {
    title: title || source.title,
    content: content !== undefined ? content : source.content,
    url: url !== undefined ? url : source.url,
  });

  return successResponse(res, { data: updated, statusCode: 200 });
}

export async function createChunkHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { sourceId, propertyId, content, chunkIndex, embedding, metadata } = req.body;
  if (!sourceId || !propertyId || !content || chunkIndex === undefined) {
    return errorResponse(res, { message: "sourceId, propertyId, content, and chunkIndex are required", statusCode: 400 });
  }

  const companyId = req.user?.companyId;
  if (!companyId) return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });

  const source = await knowledgeRepository.findSourceById(sourceId);
  if (!source) {
    return errorResponse(res, { message: "Source not found", statusCode: 404 });
  }
  if (source.companyId !== companyId) {
    return errorResponse(res, { message: "Source not found", statusCode: 404 });
  }
  if (source.propertyId !== propertyId) {
    return errorResponse(res, {
      message: "propertyId must match the source's property",
      statusCode: 400,
    });
  }

  await assertTenantPropertyAndAgentAccess(companyId, req.user?.id, propertyId);

  const chunk = await knowledgeRepository.createChunk({
    companyId,
    sourceId,
    propertyId,
    content,
    chunkIndex,
    embedding: embedding || null,
    metadata: metadata || null,
  });

  return successResponse(res, { data: chunk, statusCode: 201 });
}

export async function getSourceChunksHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { sourceId } = req.params;
  const id = sourceId;
  const companyId = req.user?.companyId;
  if (!companyId) return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });

  const source = await knowledgeRepository.findSourceById(id);
  if (!source) {
    return errorResponse(res, { message: "Source not found", statusCode: 404 });
  }

  if (source.companyId !== companyId) {
    return errorResponse(res, { message: "Source not found", statusCode: 404 });
  }

  await assertTenantPropertyAndAgentAccess(companyId, req.user?.id, source.propertyId);

  const chunks = await knowledgeRepository.findChunksBySource(id, companyId);
  return successResponse(res, { data: chunks, statusCode: 200 });
}

export async function searchChunksHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const { propertyId, query, topK } = req.body;
  if (!propertyId || !query) {
    return errorResponse(res, { message: "propertyId and query are required", statusCode: 400 });
  }

  const companyId = req.user?.companyId;
  if (!companyId) return errorResponse(res, { message: "Forbidden: Company context required", statusCode: 403 });

  await assertTenantPropertyAndAgentAccess(companyId, req.user?.id, propertyId);

  const results = await knowledgeService.searchRelevantChunks(
    propertyId,
    query,
    topK || 5
  );

  return successResponse(res, { data: results, statusCode: 200 });
}

