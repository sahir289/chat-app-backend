import OpenAI from "openai";
import { config } from "../config";
import { getModuleLogger } from "../utils/logger";

const log = getModuleLogger("embedding");

const DEFAULT_LOCAL_DIMENSIONS = 384;
const LOCAL_EMBEDDING_MODEL = "local:hash-ngrams-v2";

const openAiClient = config.openai.proApiKey
  ? new OpenAI({ apiKey: config.openai.proApiKey })
  : null;

export type GeneratedEmbedding = {
  vector: number[];
  vendor: "openai" | "local";
  model: string;
  dimensions: number;
};

export type GeneratedEmbeddingBatch = {
  vectors: number[][];
  vendor: "openai" | "local";
  model: string;
  dimensions: number;
};

function normalizeWord(word: string): string {
  const cleaned = word
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");

  if (cleaned.length <= 3) {
    return cleaned;
  }

  return cleaned
    .replace(/(ing|edly|ed|ly|ies|s)$/i, (suffix) => {
      if (suffix.toLowerCase() === "ies" && cleaned.length > 4) {
        return "y";
      }
      return "";
    })
    .trim();
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => normalizeWord(token))
    .filter((token) => token.length >= 2);
}

function buildCharacterNgrams(text: string, size: number): string[] {
  const collapsed = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (collapsed.length <= size) {
    return collapsed ? [collapsed] : [];
  }

  const grams: string[] = [];
  for (let index = 0; index <= collapsed.length - size; index++) {
    grams.push(collapsed.slice(index, index + size));
  }
  return grams;
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) {
    return vector;
  }
  return vector.map((value) => value / magnitude);
}

function buildLocalEmbedding(text: string): number[] {
  const vector = new Array(DEFAULT_LOCAL_DIMENSIONS).fill(0);
  const tokens = tokenize(text);
  const tokenPairs = tokens.slice(1).map((token, index) => `${tokens[index]}_${token}`);
  const grams = buildCharacterNgrams(text, 3);
  const features = [...tokens, ...tokenPairs, ...grams];

  for (const [index, feature] of features.entries()) {
    let hash = 2166136261;
    for (let offset = 0; offset < feature.length; offset++) {
      hash ^= feature.charCodeAt(offset);
      hash = Math.imul(hash, 16777619);
    }

    const position = Math.abs(hash) % DEFAULT_LOCAL_DIMENSIONS;
    const weight = feature.includes("_") ? 1.4 : feature.length <= 3 ? 0.6 : 1;
    vector[position] += weight / Math.sqrt(index + 1);
  }

  return normalizeVector(vector);
}

function computeSetOverlap(left: string[], right: string[]): number {
  if (!left.length || !right.length) {
    return 0;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let matches = 0;

  for (const token of leftSet) {
    if (rightSet.has(token)) {
      matches++;
    }
  }

  const queryCoverage = matches / Math.max(leftSet.size, 1);
  const jaccard = matches / Math.max(leftSet.size + rightSet.size - matches, 1);
  // Favor chunks that cover most query terms, while still considering set precision.
  return Math.min(1, queryCoverage * 0.8 + jaccard * 0.2);
}

function scorePhraseBoost(query: string, text: string): number {
  const normalizedQuery = query.toLowerCase().replace(/\s+/g, " ").trim();
  const normalizedText = text.toLowerCase().replace(/\s+/g, " ").trim();

  if (!normalizedQuery || !normalizedText) {
    return 0;
  }

  if (normalizedText.includes(normalizedQuery)) {
    return 0.25;
  }

  const queryParts = normalizedQuery.split(" ").filter((part) => part.length >= 4);
  const matchedParts = queryParts.filter((part) => normalizedText.includes(part));
  const partialBoost = queryParts.length > 0 ? (matchedParts.length / queryParts.length) * 0.1 : 0;

  const firstToken = normalizedQuery.split(" ")[0] || "";
  const questionStemBoost =
    (firstToken === "who" && normalizedText.includes("who is")) ||
    (firstToken === "what" && normalizedText.includes("what is")) ||
    (firstToken === "where" && normalizedText.includes("where is")) ||
    (firstToken === "when" && normalizedText.includes("when is")) ||
    (firstToken === "how" && normalizedText.includes("how much"))
      ? 0.08
      : 0;

  return Math.min(0.3, partialBoost + questionStemBoost);
}

function calculateLexicalSimilarity(query: string, text: string): number {
  const queryTokens = tokenize(query);
  const textTokens = tokenize(text);

  if (!queryTokens.length || !textTokens.length) {
    return 0;
  }

  const tokenOverlap = computeSetOverlap(queryTokens, textTokens);
  const queryBigrams = queryTokens.slice(1).map((token, index) => `${queryTokens[index]}_${token}`);
  const textBigrams = textTokens.slice(1).map((token, index) => `${textTokens[index]}_${token}`);
  const bigramOverlap = computeSetOverlap(queryBigrams, textBigrams);
  const charNgramOverlap = computeSetOverlap(buildCharacterNgrams(query, 3), buildCharacterNgrams(text, 3));
  const phraseBoost = scorePhraseBoost(query, text);

  return Math.min(
    1,
    tokenOverlap * 0.5 + bigramOverlap * 0.2 + charNgramOverlap * 0.2 + phraseBoost
  );
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (!left.length || !right.length || left.length !== right.length) {
    return 0;
  }

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index++) {
    const leftValue = left[index] || 0;
    const rightValue = right[index] || 0;
    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (!leftMagnitude || !rightMagnitude) {
    return 0;
  }

  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

async function generateOpenAiEmbeddings(texts: string[]): Promise<GeneratedEmbeddingBatch | null> {
  if (!openAiClient || texts.length === 0) {
    return null;
  }

  const sanitizedInputs = texts
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter((text) => text.length > 0);

  if (sanitizedInputs.length !== texts.length || sanitizedInputs.length === 0) {
    return null;
  }

  try {
    const vectors: number[][] = [];
    const batchSize = Math.max(1, config.openai.embeddingBatchSize);

    for (let index = 0; index < sanitizedInputs.length; index += batchSize) {
      const batch = sanitizedInputs.slice(index, index + batchSize);
      const response = await openAiClient.embeddings.create({
        model: config.openai.embeddingModel,
        input: batch,
      });

      vectors.push(...response.data.map((item) => item.embedding));
    }

    const dimensions = vectors[0]?.length || 0;
    if (!dimensions) {
      return null;
    }

    return {
      vectors,
      vendor: "openai",
      model: config.openai.embeddingModel,
      dimensions,
    };
  } catch (error) {
    log.warn("[Embedding] Failed to generate OpenAI embeddings. Falling back to local vectors.", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export const embeddingService = {
  async generateEmbedding(text: string): Promise<GeneratedEmbedding> {
    const batch = await this.generateEmbeddings([text]);
    return {
      vector: batch.vectors[0] || [],
      vendor: batch.vendor,
      model: batch.model,
      dimensions: batch.dimensions,
    };
  },

  async generateEmbeddings(texts: string[]): Promise<GeneratedEmbeddingBatch> {
    const openAiBatch = await generateOpenAiEmbeddings(texts);
    if (openAiBatch) {
      return openAiBatch;
    }

    const vectors = texts.map((text) => buildLocalEmbedding(text));
    return {
      vectors,
      vendor: "local",
      model: LOCAL_EMBEDDING_MODEL,
      dimensions: DEFAULT_LOCAL_DIMENSIONS,
    };
  },

  calculateSimilarity(query: string, text: string): number {
    return calculateLexicalSimilarity(query, text);
  },

  calculateCosineSimilarity(queryEmbedding: number[], chunkEmbedding: number[]): number {
    return cosineSimilarity(queryEmbedding, chunkEmbedding);
  },

  calculateHybridSimilarity(params: {
    query: string;
    text: string;
    queryEmbedding?: number[];
    chunkEmbedding?: number[];
  }): number {
    const lexicalScore = calculateLexicalSimilarity(params.query, params.text);
    const semanticScore =
      params.queryEmbedding && params.chunkEmbedding
        ? Math.max(0, cosineSimilarity(params.queryEmbedding, params.chunkEmbedding))
        : 0;

    if (semanticScore > 0) {
      return Math.min(1, semanticScore * 0.72 + lexicalScore * 0.28);
    }

    return lexicalScore;
  },
};
