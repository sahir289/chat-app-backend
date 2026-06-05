export const openaiConfig = {
    proApiKey: process.env.OPENAI_PRO_API_KEY || "",
    chatModel: process.env.OPENAI_CHAT_MODEL || "gpt-5.4-mini",
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    embeddingBatchSize: Number.parseInt(process.env.OPENAI_EMBEDDING_BATCH_SIZE || "64", 10) || 64,
} as const;

