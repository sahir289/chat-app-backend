import type {
  EmbeddingVendor,
  KnowledgeChunk,
  KnowledgeSource,
  KnowledgeStatus,
  SourceType,
} from "@prisma/client";
import prisma from "../lib/prisma";
import type { GeneratedEmbedding } from "../services/embeddingService";
import { embeddingService } from "../services/embeddingService";

type SearchChunkRecord = {
  chunk: KnowledgeChunk;
  source: KnowledgeSource;
  similarity: number;
};

type VectorSearchRow = {
  chunkId: string;
  chunkSourceId: string;
  chunkPropertyId: string;
  chunkContent: string;
  chunkIndex: number;
  chunkMetadata: unknown;
  chunkCreatedAt: Date;
  sourceId: string;
  sourcePropertyId: string;
  sourceType: SourceType;
  sourceTitle: string;
  sourceContent: string | null;
  sourceUrl: string | null;
  sourceFilePath: string | null;
  sourceFileName: string | null;
  sourceStatus: KnowledgeStatus;
  sourceChunkCount: number;
  sourceError: string | null;
  sourceCreatedAt: Date;
  sourceUpdatedAt: Date;
  semanticScore: number;
};

let pgvectorAvailableCache: boolean | null = null;

const EMBEDDING_VENDOR_MAP: Record<string, EmbeddingVendor> = {
  openai: "OPENAI",
  gemini: "GEMINI",
  local: "LOCAL",
};

function normalizeEmbeddingVendor(vendor?: string | null): EmbeddingVendor | null {
  if (!vendor) {
    return null;
  }

  return EMBEDDING_VENDOR_MAP[String(vendor).trim().toLowerCase()] ?? null;
}

function toVectorLiteral(values: number[]): string {
  return `[${values.map((value) => Number(value).toString()).join(",")}]`;
}

function parseFallbackEmbedding(metadata: unknown): number[] | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>).fallbackEmbedding;
  if (!Array.isArray(value)) {
    return null;
  }

  const embedding = value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry));

  return embedding.length > 0 ? embedding : null;
}

function buildSearchChunkRecord(params: {
  chunk: {
    id: string;
    sourceId: string;
    propertyId: string;
    content: string;
    chunkIndex: number;
    metadata: unknown;
    createdAt: Date;
  };
  source: {
    id: string;
    propertyId: string;
    sourceType: SourceType;
    title: string;
    content: string | null;
    url: string | null;
    filePath: string | null;
    fileName: string | null;
    status: KnowledgeStatus;
    chunkCount: number;
    error: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  similarity: number;
}): SearchChunkRecord {
  return {
    chunk: {
      id: params.chunk.id,
      sourceId: params.chunk.sourceId,
      propertyId: params.chunk.propertyId,
      content: params.chunk.content,
      chunkIndex: params.chunk.chunkIndex,
      metadata: params.chunk.metadata as any,
      createdAt: params.chunk.createdAt,
    } as KnowledgeChunk,
    source: {
      id: params.source.id,
      propertyId: params.source.propertyId,
      sourceType: params.source.sourceType,
      title: params.source.title,
      content: params.source.content,
      url: params.source.url,
      filePath: params.source.filePath,
      fileName: params.source.fileName,
      status: params.source.status,
      chunkCount: params.source.chunkCount,
      error: params.source.error,
      createdAt: params.source.createdAt,
      updatedAt: params.source.updatedAt,
    } as KnowledgeSource,
    similarity: params.similarity,
  };
}

async function hasPgvector(): Promise<boolean> {
  if (pgvectorAvailableCache !== null) {
    return pgvectorAvailableCache;
  }

  try {
    const result = await prisma.$queryRawUnsafe<Array<{ extname: string }>>(
      "SELECT extname FROM pg_extension WHERE extname = 'vector';"
    );
    pgvectorAvailableCache = result.length > 0;
  } catch {
    pgvectorAvailableCache = false;
  }

  return pgvectorAvailableCache;
}

async function runVectorSearch(params: {
  propertyId: string;
  queryEmbedding: GeneratedEmbedding;
  limit: number;
}): Promise<Map<string, number>> {
  const normalizedVendor = normalizeEmbeddingVendor(params.queryEmbedding.vendor);
  if (!(await hasPgvector()) || params.queryEmbedding.vector.length === 0 || !normalizedVendor) {
    return new Map<string, number>();
  }

  try {
    const rows = await prisma.$queryRawUnsafe<VectorSearchRow[]>(
      `
        SELECT
          kc."id" AS "chunkId",
          kc."sourceId" AS "chunkSourceId",
          kc."propertyId" AS "chunkPropertyId",
          kc."content" AS "chunkContent",
          kc."chunkIndex" AS "chunkIndex",
          kc."metadata" AS "chunkMetadata",
          kc."createdAt" AS "chunkCreatedAt",
          ks."id" AS "sourceId",
          ks."propertyId" AS "sourcePropertyId",
          ks."sourceType" AS "sourceType",
          ks."title" AS "sourceTitle",
          ks."content" AS "sourceContent",
          ks."url" AS "sourceUrl",
          ks."filePath" AS "sourceFilePath",
          ks."fileName" AS "sourceFileName",
          ks."status" AS "sourceStatus",
          ks."chunkCount" AS "sourceChunkCount",
          ks."error" AS "sourceError",
          ks."createdAt" AS "sourceCreatedAt",
          ks."updatedAt" AS "sourceUpdatedAt",
          GREATEST(0, 1 - (kc."embedding" <=> $1::vector)) AS "semanticScore"
        FROM "KnowledgeChunk" kc
        INNER JOIN "KnowledgeSource" ks ON ks."id" = kc."sourceId"
        WHERE
          kc."propertyId" = $2
          AND ks."deletedAt" IS NULL
          AND ks."status" = 'READY'
          AND kc."embeddingVendor" = $3
          AND kc."embeddingModel" = $4
          AND kc."embedding" IS NOT NULL
        ORDER BY kc."embedding" <=> $1::vector
        LIMIT $5
      `,
      toVectorLiteral(params.queryEmbedding.vector),
      params.propertyId,
      normalizedVendor,
      params.queryEmbedding.model,
      params.limit
    );

    return new Map(rows.map((row) => [row.chunkId, Number(row.semanticScore) || 0]));
  } catch {
    return new Map<string, number>();
  }
}

export const knowledgeRepository = {
  async createSource(data: {
    companyId: string;
    propertyId: string;
    sourceType: SourceType;
    title: string;
    content?: string | null;
    url?: string | null;
    filePath?: string | null;
    fileName?: string | null;
    status?: KnowledgeStatus;
  }): Promise<KnowledgeSource> {
    if (!(prisma as any).knowledgeSource) {
      throw new Error("KnowledgeSource model not available. Run 'npx prisma generate' and restart server.");
    }

    return (prisma as any).knowledgeSource.create({
      data: {
        companyId: data.companyId,
        propertyId: data.propertyId,
        sourceType: data.sourceType,
        title: data.title,
        content: data.content ?? null,
        url: data.url ?? null,
        filePath: data.filePath ?? null,
        fileName: data.fileName ?? null,
        status: data.status || ("PENDING" as KnowledgeStatus),
      },
    });
  },

  async findSourceById(id: string): Promise<KnowledgeSource | null> {
    if (!(prisma as any).knowledgeSource) {
      return null;
    }

    return (prisma as any).knowledgeSource.findFirst({
      where: { id, deletedAt: null },
      include: { chunks: true },
    });
  },

  async findSourcesByProperty(propertyId: string, companyId?: string): Promise<KnowledgeSource[]> {
    if (!(prisma as any).knowledgeSource) {
      return [];
    }

    return (prisma as any).knowledgeSource.findMany({
      where: {
        propertyId,
        ...(companyId ? { companyId } : {}),
        deletedAt: null,
      },
      orderBy: { createdAt: "desc" },
      include: {
        chunks: {
          orderBy: { chunkIndex: "asc" },
        },
      },
    });
  },

  async findReadySourcesByProperty(
    propertyId: string,
    companyId?: string,
    limit: number = 5
  ): Promise<KnowledgeSource[]> {
    if (!(prisma as any).knowledgeSource) {
      return [];
    }

    return (prisma as any).knowledgeSource.findMany({
      where: {
        propertyId,
        ...(companyId ? { companyId } : {}),
        status: "READY",
        deletedAt: null,
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
  },

  async updateSourceStatus(
    id: string,
    status: KnowledgeStatus,
    chunkCount?: number,
    error?: string | null
  ): Promise<KnowledgeSource> {
    if (!(prisma as any).knowledgeSource) {
      throw new Error("KnowledgeSource model not available.");
    }

    return (prisma as any).knowledgeSource.update({
      where: { id },
      data: {
        status,
        ...(chunkCount !== undefined && { chunkCount }),
        ...(error !== undefined
          ? { error }
          : status === "READY" || status === "PROCESSING"
            ? { error: null }
            : {}),
      },
    });
  },

  async softDeleteSource(id: string): Promise<KnowledgeSource> {
    if (!(prisma as any).knowledgeSource) {
      throw new Error("KnowledgeSource model not available.");
    }

    return (prisma as any).knowledgeSource.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },

  async createChunk(data: {
    companyId: string;
    sourceId: string;
    propertyId: string;
    content: string;
    chunkIndex: number;
    embedding?: number[] | null;
    embeddingVendor?: string | null;
    embeddingModel?: string | null;
    embeddingDim?: number | null;
    metadata?: Record<string, any> | null;
  }): Promise<KnowledgeChunk> {
    if (!(prisma as any).knowledgeChunk) {
      throw new Error("KnowledgeChunk model not available.");
    }

    const chunkId = `${data.sourceId}_${data.chunkIndex}`;
    const canStoreVectors = await hasPgvector();
    const normalizedVendor = normalizeEmbeddingVendor(data.embeddingVendor);
    const metadata =
      !canStoreVectors &&
      normalizedVendor === "LOCAL" &&
      data.embedding &&
      data.embedding.length > 0
        ? { ...(data.metadata || {}), fallbackEmbedding: data.embedding }
        : data.metadata || null;

    await (prisma as any).knowledgeChunk.create({
      data: {
        id: chunkId,
        companyId: data.companyId,
        sourceId: data.sourceId,
        propertyId: data.propertyId,
        content: data.content,
        chunkIndex: data.chunkIndex,
        metadata,
        embeddingVendor: normalizedVendor,
        embeddingModel: data.embeddingModel ?? null,
        embeddingDim: data.embeddingDim ?? null,
      },
    });

    if (canStoreVectors && data.embedding && data.embedding.length > 0) {
      await prisma.$executeRawUnsafe(
        `
          UPDATE "KnowledgeChunk"
          SET embedding = $1::vector
          WHERE id = $2
        `,
        toVectorLiteral(data.embedding),
        chunkId
      );
    }

    return (prisma as any).knowledgeChunk.findUnique({
      where: { id: chunkId },
    });
  },

  async createChunks(
    chunks: Array<{
      companyId: string;
      sourceId: string;
      propertyId: string;
      content: string;
      chunkIndex: number;
      embedding?: number[] | null;
      embeddingVendor?: string | null;
      embeddingModel?: string | null;
      embeddingDim?: number | null;
      metadata?: Record<string, any> | null;
    }>
  ): Promise<void> {
    for (const chunk of chunks) {
      await this.createChunk(chunk);
    }
  },

  async updateSource(dataId: string, data: {
    title?: string;
    content?: string | null;
    url?: string | null;
    error?: string | null;
  }): Promise<KnowledgeSource> {
    if (!(prisma as any).knowledgeSource) {
      throw new Error("KnowledgeSource model not available.");
    }

    return (prisma as any).knowledgeSource.update({
      where: { id: dataId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.content !== undefined && { content: data.content }),
        ...(data.url !== undefined && { url: data.url }),
        ...(data.error !== undefined && { error: data.error }),
      },
    });
  },

  async searchSimilarChunks(
    propertyId: string,
    queryText: string,
    topK: number = 5,
    queryEmbedding?: GeneratedEmbedding
  ): Promise<SearchChunkRecord[]> {
    if (!(prisma as any).knowledgeChunk || !(prisma as any).knowledgeSource) {
      return [];
    }

    const semanticScores =
      queryEmbedding && queryEmbedding.vector.length > 0
        ? await runVectorSearch({
            propertyId,
            queryEmbedding,
            limit: Math.max(topK * 8, 12),
          })
        : new Map<string, number>();

    const chunks = await (prisma as any).knowledgeChunk.findMany({
      where: {
        propertyId,
      },
      include: {
        source: true,
      },
    });

    const ranked = chunks
      .filter((chunk: any) => chunk.source && !chunk.source.deletedAt && chunk.source.status === "READY")
      .map((chunk: any): SearchChunkRecord => {
        const lexicalScore = embeddingService.calculateSimilarity(queryText, chunk.content || "");
        let semanticScore = semanticScores.get(chunk.id) ?? 0;

        if (!semanticScore && queryEmbedding?.vendor === "local") {
          const fallbackEmbedding = parseFallbackEmbedding(chunk.metadata);
          if (fallbackEmbedding && fallbackEmbedding.length === queryEmbedding.vector.length) {
            semanticScore = embeddingService.calculateCosineSimilarity(
              queryEmbedding.vector,
              fallbackEmbedding
            );
          }
        }

        const similarity =
          semanticScore > 0
            ? Math.min(1, semanticScore * 0.72 + lexicalScore * 0.28)
            : lexicalScore;

        return buildSearchChunkRecord({
          chunk: {
            id: chunk.id,
            sourceId: chunk.sourceId,
            propertyId: chunk.propertyId,
            content: chunk.content,
            chunkIndex: chunk.chunkIndex,
            metadata: chunk.metadata,
            createdAt: chunk.createdAt,
          },
          source: {
            id: chunk.source.id,
            propertyId: chunk.source.propertyId,
            sourceType: chunk.source.sourceType,
            title: chunk.source.title,
            content: chunk.source.content,
            url: chunk.source.url,
            filePath: chunk.source.filePath,
            fileName: chunk.source.fileName,
            status: chunk.source.status,
            chunkCount: chunk.source.chunkCount,
            error: chunk.source.error,
            createdAt: chunk.source.createdAt,
            updatedAt: chunk.source.updatedAt,
          },
          similarity,
        });
      })
      .filter((result: SearchChunkRecord) => result.similarity > 0)
      .sort((left: SearchChunkRecord, right: SearchChunkRecord) => right.similarity - left.similarity)
      .slice(0, topK);

    return ranked;
  },

  async findChunksBySource(sourceId: string, companyId?: string): Promise<KnowledgeChunk[]> {
    if (!(prisma as any).knowledgeChunk) {
      return [];
    }

    return (prisma as any).knowledgeChunk.findMany({
      where: {
        sourceId,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { chunkIndex: "asc" },
    });
  },

  async deleteChunksBySource(sourceId: string): Promise<void> {
    if (!(prisma as any).knowledgeChunk) {
      return;
    }

    await (prisma as any).knowledgeChunk.deleteMany({
      where: { sourceId },
    });
  },

  async countSourcesByCompany(companyId: string): Promise<number> {
    if (!(prisma as any).knowledgeSource) {
      return 0;
    }

    return (prisma as any).knowledgeSource.count({
      where: {
        companyId,
        deletedAt: null,
      },
    });
  },

  async countTextSourcesByCompany(companyId: string): Promise<number> {
    if (!(prisma as any).knowledgeSource) {
      return 0;
    }

    return (prisma as any).knowledgeSource.count({
      where: {
        companyId,
        sourceType: "TEXT",
        deletedAt: null,
      },
    });
  },

  async countUrlSourcesByCompany(companyId: string): Promise<number> {
    if (!(prisma as any).knowledgeSource) {
      return 0;
    }

    return (prisma as any).knowledgeSource.count({
      where: {
        companyId,
        sourceType: "URL",
        deletedAt: null,
      },
    });
  },
};
