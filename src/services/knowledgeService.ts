import * as fs from "fs/promises";
import * as path from "path";
import type { SourceType } from "@prisma/client";
import { knowledgeRepository } from "../repositories/knowledgeRepository";
import type { ChunkSearchResult, KnowledgeSourceDTO } from "../types/knowledge";
import { AppError } from "../utils/appError";
import { extractTextFromPDF } from "../utils/pdfExtractor";
import { chunkText } from "../utils/textChunker";
import { scrapeUrlContent } from "../utils/urlScraper";
import { embeddingService } from "./embeddingService";
import { buildSearchQuery, normalizeUserText } from "../utils/textNormalization";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "knowledge");

async function ensureUploadDir() {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch {
    // noop
  }
}

const mapSourceType = (type: any) => (type === "FILE" ? "pdf" : type === "TEXT" ? "text" : "url");
const mapStatus = (status: any) =>
  status === "READY"
    ? "completed"
    : status === "PENDING"
      ? "pending"
      : status === "PROCESSING"
        ? "processing"
        : "failed";

function mapSource(source: any): KnowledgeSourceDTO {
  return {
    id: source.id,
    propertyId: source.propertyId,
    sourceType: mapSourceType(source.sourceType),
    title: source.title,
    content: source.content,
    url: source.url,
    filePath: source.filePath,
    fileName: source.fileName,
    status: mapStatus(source.status),
    chunkCount: source.chunkCount,
    error: source.error ?? null,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

export const knowledgeService = {
  async createTextSource(params: {
    companyId: string;
    propertyId: string;
    title: string;
    content: string;
  }): Promise<KnowledgeSourceDTO> {
    const source = await knowledgeRepository.createSource({
      companyId: params.companyId,
      propertyId: params.propertyId,
      sourceType: "TEXT" as SourceType,
      title: params.title,
      content: params.content,
      status: "PROCESSING",
    });

    this.processTextSource(source.id, params.content).catch(async (error) => {
      await knowledgeRepository.updateSourceStatus(
        source.id,
        "FAILED",
        undefined,
        error instanceof Error ? error.message : String(error)
      );
    });

    return mapSource(source);
  },

  async createUrlSource(params: {
    companyId: string;
    propertyId: string;
    url: string;
  }): Promise<KnowledgeSourceDTO> {
    const source = await knowledgeRepository.createSource({
      companyId: params.companyId,
      propertyId: params.propertyId,
      sourceType: "URL" as SourceType,
      title: params.url,
      url: params.url,
      status: "PROCESSING",
    });

    this.processUrlSource(source.id, params.url).catch(async (error) => {
      await knowledgeRepository.updateSourceStatus(
        source.id,
        "FAILED",
        undefined,
        error instanceof Error ? error.message : String(error)
      );
    });

    return mapSource(source);
  },

  async createPdfSource(params: {
    companyId: string;
    propertyId: string;
    fileName: string;
    fileBuffer: Buffer;
  }): Promise<KnowledgeSourceDTO> {
    await ensureUploadDir();

    const fileId = `${Date.now()}_${params.fileName}`;
    const filePath = path.join(UPLOAD_DIR, fileId);
    await fs.writeFile(filePath, params.fileBuffer);

    const source = await knowledgeRepository.createSource({
      companyId: params.companyId,
      propertyId: params.propertyId,
      sourceType: "FILE" as SourceType,
      title: params.fileName,
      fileName: params.fileName,
      filePath,
      status: "PROCESSING",
    });

    this.processPdfSource(source.id, filePath).catch(async (error) => {
      await knowledgeRepository.updateSourceStatus(
        source.id,
        "FAILED",
        undefined,
        error instanceof Error ? error.message : String(error)
      );
    });

    return mapSource(source);
  },

  async processTextSource(sourceId: string, content: string): Promise<void> {
    try {
      await knowledgeRepository.deleteChunksBySource(sourceId);

      const chunks = chunkText(content, 1200, 180);
      if (chunks.length === 0) {
        throw new AppError(422, "No searchable content found after chunking.");
      }

      const embeddingBatch = await embeddingService.generateEmbeddings(chunks.map((chunk) => chunk.trim()));
      const source = await knowledgeRepository.findSourceById(sourceId);
      if (!source) {
        throw new AppError(404, "Source not found");
      }

      const chunkData = chunks.map((chunk, index) => ({
        companyId: source.companyId,
        sourceId,
        propertyId: source.propertyId,
        content: chunk.trim(),
        chunkIndex: index,
        embedding: embeddingBatch.vectors[index] || [],
        embeddingVendor: embeddingBatch.vendor,
        embeddingModel: embeddingBatch.model,
        embeddingDim: embeddingBatch.dimensions,
        metadata: {
          wordCount: chunk.split(/\s+/).length,
          preview: chunk.slice(0, 240),
        },
      }));

      await knowledgeRepository.createChunks(chunkData);
      await knowledgeRepository.updateSourceStatus(sourceId, "READY", chunks.length, null);
    } catch (error) {
      await knowledgeRepository.updateSourceStatus(
        sourceId,
        "FAILED",
        undefined,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  },

  async processUrlSource(sourceId: string, url: string): Promise<void> {
    try {
      const { title, content } = await scrapeUrlContent(url);
      await knowledgeRepository.updateSource(sourceId, {
        title,
        content,
        url,
        error: null,
      });

      await this.processTextSource(sourceId, content);
    } catch (error) {
      await knowledgeRepository.updateSourceStatus(
        sourceId,
        "FAILED",
        undefined,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  },

  async processPdfSource(sourceId: string, filePath: string): Promise<void> {
    try {
      const fileBuffer = await fs.readFile(filePath);
      const text = await extractTextFromPDF(fileBuffer, path.basename(filePath));
      const normalizedText = text.trim();

      if (!normalizedText) {
        throw new AppError(422, "No readable text could be extracted from the PDF.");
      }

      await knowledgeRepository.updateSource(sourceId, {
        content: normalizedText,
        error: null,
      });

      await this.processTextSource(sourceId, normalizedText);
    } catch (error) {
      await knowledgeRepository.updateSourceStatus(
        sourceId,
        "FAILED",
        undefined,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  },

  async getSourcesByProperty(propertyId: string, companyId: string): Promise<KnowledgeSourceDTO[]> {
    const sources = await knowledgeRepository.findSourcesByProperty(propertyId, companyId);
    return sources.map(mapSource);
  },

  async getSourceTitlesForProperty(
    propertyId: string,
    companyId?: string,
    limit: number = 5
  ): Promise<string[]> {
    const sources = await knowledgeRepository.findReadySourcesByProperty(propertyId, companyId, limit);
    return sources
      .map((source) => source.title?.trim())
      .filter((title): title is string => Boolean(title));
  },

  async searchRelevantChunks(
    propertyId: string,
    query: string,
    topK: number = 5
  ): Promise<ChunkSearchResult[]> {
    const normalizedQuery = buildSearchQuery(query) || normalizeUserText(query);
    const queryEmbedding = await embeddingService.generateEmbedding(normalizedQuery).catch(() => null);
    const results = await knowledgeRepository.searchSimilarChunks(
      propertyId,
      normalizedQuery,
      topK,
      queryEmbedding || undefined
    );

    return results.map((result) => {
      let parsedMetadata: Record<string, any> | null = null;

      try {
        if (typeof result.chunk.metadata === "string") {
          parsedMetadata = JSON.parse(result.chunk.metadata);
        } else if (result.chunk.metadata && typeof result.chunk.metadata === "object") {
          parsedMetadata = result.chunk.metadata as Record<string, any>;
        }
      } catch {
        parsedMetadata = null;
      }

      return {
        chunk: {
          id: result.chunk.id,
          sourceId: result.chunk.sourceId,
          propertyId: result.chunk.propertyId,
          content: result.chunk.content,
          chunkIndex: result.chunk.chunkIndex,
          metadata: parsedMetadata,
          createdAt: result.chunk.createdAt,
        },
        source: {
          id: result.source.id,
          propertyId: result.source.propertyId,
          sourceType: mapSourceType(result.source.sourceType) as "pdf" | "text" | "url",
          title: result.source.title,
          content: result.source.content,
          url: result.source.url,
          filePath: result.source.filePath,
          fileName: result.source.fileName,
          status: mapStatus(result.source.status) as "pending" | "processing" | "completed" | "failed",
          chunkCount: result.source.chunkCount,
          error: (result.source as any).error ?? null,
          createdAt: result.source.createdAt,
          updatedAt: result.source.updatedAt,
        },
        similarity: Number(result.similarity),
      };
    });
  },

  async reprocessSource(sourceId: string): Promise<void> {
    const source = await knowledgeRepository.findSourceById(sourceId);
    if (!source) {
      throw new AppError(404, "Source not found");
    }

    await knowledgeRepository.updateSourceStatus(sourceId, "PROCESSING", undefined, null);

    try {
      if (source.sourceType === "TEXT" && source.content) {
        await this.processTextSource(sourceId, source.content);
        return;
      }

      if (source.sourceType === "URL" && source.url) {
        await this.processUrlSource(sourceId, source.url);
        return;
      }

      if (source.sourceType === "FILE" && source.filePath) {
        await this.processPdfSource(sourceId, source.filePath);
        return;
      }

      throw new AppError(400, "Source has no processable content");
    } catch (error) {
      await knowledgeRepository.updateSourceStatus(
        sourceId,
        "FAILED",
        undefined,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  },

  async deleteSource(sourceId: string): Promise<void> {
    await knowledgeRepository.softDeleteSource(sourceId);
    await knowledgeRepository.deleteChunksBySource(sourceId);
  },
};
