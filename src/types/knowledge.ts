export interface KnowledgeSourceDTO {
  id: string;
  propertyId: string;
  sourceType: "pdf" | "text" | "url";
  title: string;
  content?: string | null;
  url?: string | null;
  filePath?: string | null;
  fileName?: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  chunkCount: number;
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeChunkDTO {
  id: string;
  sourceId: string;
  propertyId: string;
  content: string;
  chunkIndex: number;
  metadata?: Record<string, any> | null;
  createdAt: Date;
}

export interface CreateKnowledgeSourceDTO {
  propertyId: string;
  sourceType: "pdf" | "text" | "url";
  title: string;
  content?: string;
  url?: string;
  file?: File;
}

export interface SearchChunksDTO {
  propertyId: string;
  query: string;
  topK?: number;
}

export interface ChunkSearchResult {
  chunk: KnowledgeChunkDTO;
  source: KnowledgeSourceDTO;
  similarity: number;
}

