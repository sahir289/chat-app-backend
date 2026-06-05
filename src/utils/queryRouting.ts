export type QueryIntent = "GREETING" | "TRIVIAL" | "SIMPLE_FACTUAL" | "NORMAL";

export interface QueryIntentProfile {
  intent: QueryIntent;
  retrievalTopK: number;
  maxKnowledgeChunks: number;
  maxChunkChars: number;
  maxContextMessages: number;
  maxCompletionTokens: number;
}

const GREETINGS = [
  "hi",
  "hello",
  "hey",
  "yo",
  "hola",
  "good morning",
  "good afternoon",
  "good evening",
  "hii",
  "hiii",
  "hiiii",
  "heyy",
  "heyyy",
  "helloo",
  "hello there",
  "hi there",
  "hey there",
  "gm",
  "ge",
  "sup",
  "wassup",
  "what's up",
  "whats up",
  "hlo",
  "helo",
  "hlw",
  "hy",
];

const TRIVIAL_MESSAGES = [
  "thanks",
  "thank you",
  "ok",
  "okay",
  "cool",
  "got it",
  "great",
  "nice",
  "done",
  "perfect",
  "alright",
  "fine",
  "yes",
  "no",
];

const SIMPLE_FACTUAL_PREFIXES = [
  "what is",
  "what are",
  "where is",
  "when is",
  "who is",
  "who are",
  "how much",
  "how many",
  "is there",
  "do you have",
  "can i",
  "could i",
  "may i",
  "tell me about",
  "give me",
  "share",
  "show me",
];

function normalizeMessage(message: string): string {
  return message
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s?]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function startsWithAny(text: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => text.startsWith(prefix));
}

function includesAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text === pattern || text.startsWith(pattern + " "));
}

export function classifyUserQuery(rawMessage: string): QueryIntent {
  const normalized = normalizeMessage(rawMessage);
  if (!normalized) return "NORMAL";

  const wordCount = normalized.split(" ").filter(Boolean).length;
  const isQuestion = rawMessage.includes("?");
  const hasSimplePrefix = startsWithAny(normalized, SIMPLE_FACTUAL_PREFIXES);

  if (includesAny(normalized, GREETINGS) && wordCount <= 4) {
    return "GREETING";
  }

  if (includesAny(normalized, TRIVIAL_MESSAGES) && wordCount <= 4) {
    return "TRIVIAL";
  }

  if ((isQuestion || hasSimplePrefix) && wordCount <= 12) {
    return "SIMPLE_FACTUAL";
  }

  return "NORMAL";
}

export function getIntentProfile(intent: QueryIntent): QueryIntentProfile {
  switch (intent) {
    case "GREETING":
      return {
        intent,
        retrievalTopK: 0,
        maxKnowledgeChunks: 0,
        maxChunkChars: 0,
        maxContextMessages: 0,
        maxCompletionTokens: 40,
      };

    case "TRIVIAL":
      return {
        intent,
        retrievalTopK: 0,
        maxKnowledgeChunks: 0,
        maxChunkChars: 0,
        maxContextMessages: 0,
        maxCompletionTokens: 30,
      };

    case "SIMPLE_FACTUAL":
      return {
        intent,
        retrievalTopK: 8,
        maxKnowledgeChunks: 1,
        maxChunkChars: 520,
        maxContextMessages: 0,
        maxCompletionTokens: 100,
      };

    case "NORMAL":
    default:
      return {
        intent,
        retrievalTopK: 8,
        maxKnowledgeChunks: 2,
        maxChunkChars: 420,
        maxContextMessages: 2,
        maxCompletionTokens: 160,
      };
  }
}