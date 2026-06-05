import OpenAI from "openai";
import { getSectionContext } from "./constants/knowledge";
import type { ChatContextMessage, KnowledgeContextChunk } from "./services/aiService";
import { config } from "./config";
import { getModuleLogger } from "./utils/logger";
import { isValidOpenAiModelId } from "./utils/openaiChatModelResolver";
import { getIntentProfile, type QueryIntent } from "./utils/queryRouting";

const log = getModuleLogger("ai");

const { proApiKey } = config.openai;
if (!proApiKey) {
    log.warn(
        "[OpenAI] OPENAI_PRO_API_KEY is not set. Pro tier chatbot responses will be disabled until you add it to your .env file."
    );
}

function getOpenAIClient(isPro: boolean): OpenAI | null {
    // Only pro users can use OpenAI API
    if (!isPro) {
        return null;
    }

    if (!proApiKey) {
        return null;
    }

    return new OpenAI({ apiKey: proApiKey });
}

function sanitizeReplyForChat(text: string): string {
    // Remove common markdown tokens so UI shows clean plain text.
    // NOSONAR: regex replacements are intentional for markdown cleanup.
    return text
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/^\s*[-*]\s+/gm, "• ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function buildSystemPrompt(visitorName?: string | null): string {
    const nameInstruction = visitorName
        ? ` User:${visitorName}. Use name only if needed. You!=${visitorName}.`
        : "";
    return "Support bot. Short. Exact. Only given info. Missing: say no detail, contact support." + nameInstruction;
}

function extractQueryKeywords(message: string): string[] {
    const STOP_WORDS = new Set([
        "the", "and", "for", "with", "that", "this", "from", "have", "has", "had", "were",
        "will", "would", "could", "should", "your", "you", "our", "about", "what", "when",
        "where", "which", "who", "how", "much", "many", "does", "is", "are", "can", "tell",
        "me", "please",
    ]);

    return message
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .map((word) => word.trim())
        .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

function trimChunkContent(content: string, maxChars: number, focusText?: string): string {
    const compact = content.replace(/\s+/g, " ").trim();
    if (compact.length <= maxChars) return compact;

    if (!focusText) {
        return `${compact.slice(0, maxChars).trimEnd()}...`;
    }

    const lowerCompact = compact.toLowerCase();
    const keywords = extractQueryKeywords(focusText).sort((a, b) => b.length - a.length);
    const matchIndex = keywords
        .map((keyword) => lowerCompact.indexOf(keyword))
        .find((idx) => idx >= 0);

    if (matchIndex === undefined) {
        return `${compact.slice(0, maxChars).trimEnd()}...`;
    }

    const prefixWindow = Math.floor(maxChars * 0.35);
    const start = Math.max(0, matchIndex - prefixWindow);
    const end = Math.min(compact.length, start + maxChars);
    const snippet = compact.slice(start, end).trim();

    if (start === 0 && end >= compact.length) {
        return snippet;
    }
    if (start === 0) {
        return `${snippet}...`;
    }
    if (end >= compact.length) {
        return `...${snippet}`;
    }
    return `...${snippet}...`;
}

function estimateTokenCount(text: string): number {
    const normalized = text.trim();
    if (!normalized) return 0;
    // Rough heuristic for English-like text: ~4 chars per token.
    return Math.ceil(normalized.length / 4);
}

function buildKnowledgeBaseContext(
    chunks: KnowledgeContextChunk[],
    maxTotalChars: number,
    focusText?: string
): {
    text: string;
    usedChunks: number;
    skippedChunks: number;
} {
    if (chunks.length === 0 || maxTotalChars <= 0) {
        return { text: "", usedChunks: 0, skippedChunks: 0 };
    }

    const seen = new Set<string>();
    const lines: string[] = [];
    let usedChars = 0;
    let usedChunks = 0;
    let skippedChunks = 0;

    for (const chunk of chunks) {
        const normalized = chunk.content.replace(/\s+/g, " ").trim();
        if (!normalized || seen.has(normalized)) {
            skippedChunks += 1;
            continue;
        }

        seen.add(normalized);
        const linePrefix = `${usedChunks + 1}) `;
        const remaining = maxTotalChars - usedChars - linePrefix.length;
        if (remaining <= 0) {
            skippedChunks += 1;
            continue;
        }

        const compactContent = trimChunkContent(normalized, remaining, focusText);
        const line = `${linePrefix}${compactContent}`;
        lines.push(line);

        usedChars += line.length;
        usedChunks += 1;
    }

    if (lines.length === 0) {
        return { text: "", usedChunks: 0, skippedChunks };
    }

    return {
        text: `\n\nKB:\n${lines.join("\n")}`,
        usedChunks,
        skippedChunks,
    };
}

function mapSenderTypeToRole(senderType: string): "user" | "assistant" {
    if (senderType === "BOT" || senderType === "AGENT") {
        return "assistant";
    }
    return "user";
}

function isLikelyFollowUpMessage(message: string): boolean {
    const normalized = message.toLowerCase().trim();
    if (!normalized) return false;

    // Follow-up queries usually depend on previous turns ("this", "that", "again", "and what about...").
    const followUpPatterns = [
        /\b(it|this|that|they|those|these)\b/,
        /\b(again|same|also|instead|then|more|continue)\b/,
        /\bwhat about\b/,
        /\band\b/,
    ];
    const standaloneQuestionPatterns = [
        /^(what|where|when|who|why|how)\b/,
        /^(can|could|do|does|is|are|will|would|should|may)\b/,
    ];

    if (standaloneQuestionPatterns.some((pattern) => pattern.test(normalized))) {
        return false;
    }

    if (normalized.split(/\s+/).length <= 4) {
        return true;
    }

    return followUpPatterns.some((pattern) => pattern.test(normalized));
}

function buildChatHistoryContext(
    chatContext: ChatContextMessage[],
    maxMessages: number,
    maxPerMessageChars: number,
    maxTotalChars: number
): {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    usedMessages: number;
    skippedMessages: number;
} {
    if (chatContext.length === 0 || maxMessages <= 0 || maxTotalChars <= 0) {
        return { messages: [], usedMessages: 0, skippedMessages: chatContext.length };
    }

    const selected = chatContext.slice(-maxMessages);
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
    let usedChars = 0;
    let skippedMessages = 0;

    for (const msg of selected) {
        const normalized = msg.text.replace(/\s+/g, " ").trim();
        if (!normalized) {
            skippedMessages += 1;
            continue;
        }

        const role = mapSenderTypeToRole(msg.senderType);
        const compact = trimChunkContent(normalized, maxPerMessageChars);
        if (usedChars + compact.length > maxTotalChars) {
            skippedMessages += 1;
            continue;
        }

        const previous = messages[messages.length - 1];
        if (previous && previous.role === role && previous.content === compact) {
            skippedMessages += 1;
            continue;
        }

        messages.push({ role, content: compact });
        usedChars += compact.length;
    }

    return {
        messages,
        usedMessages: messages.length,
        skippedMessages,
    };
}

/** Model id is resolved server-side (Pro + Super Admin assignments); only validate shape here. */
function resolveChatModel(model?: string) {
    if (model && isValidOpenAiModelId(model)) {
        return model;
    }
    const fallback = config.openai.chatModel;
    return fallback && isValidOpenAiModelId(fallback) ? fallback : "gpt-5.4-mini";
}

async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    initialDelay = 1000
): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;

            const isQuotaError =
                error?.status === 429 ||
                error?.message?.includes("quota") ||
                error?.message?.includes("rate_limit") ||
                error?.message?.includes("exceeded your current quota");

            if (isQuotaError) {
                throw error;
            }

            const shouldRetry =
                error?.status === 503 ||
                (error?.status === 429 && !isQuotaError) ||
                error?.message?.includes("overloaded") ||
                error?.message?.includes("503") ||
                error?.message?.includes("server_error");

            if (!shouldRetry || attempt === maxRetries - 1) {
                throw error;
            }

            const delay = initialDelay * Math.pow(2, attempt);
            log.info(`[OpenAI] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    throw lastError || new Error("Max retries exceeded");
}

export async function generateReply(options: {
    message: string;
    section?: string;
    chatContext?: ChatContextMessage[];
    knowledgeChunks?: KnowledgeContextChunk[];
    isPro: boolean;
    visitorName?: string | null;
    /** Resolved chat model id (company/property policy applied before calling). */
    chatModel?: string;
    queryIntent?: QueryIntent;
}): Promise<{
    text: string;
    generatedByAi: boolean;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}> {
    const { message, section, chatContext, knowledgeChunks, isPro, visitorName, chatModel: chatModelOpt } = options;

    const client = getOpenAIClient(isPro);
    if (!client) {
        if (!isPro) {
            return {
                text: "AI-powered responses are only available for Pro plan users. Please upgrade to Pro to enable AI features.",
                generatedByAi: false,
                usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            };
        }
        return {
            text: "The AI service is not configured yet. Please set OPENAI_PRO_API_KEY on the server for Pro tier users.",
            generatedByAi: false,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
    }

    const model = resolveChatModel(chatModelOpt);

    const intentProfile = getIntentProfile(options.queryIntent ?? "NORMAL");
    const shouldUseKnowledge = intentProfile.maxKnowledgeChunks > 0;
    const sectionContext = shouldUseKnowledge && section ? getSectionContext(section) : "";

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

    const limitedKnowledgeChunks = (knowledgeChunks || [])
        .slice(0, intentProfile.maxKnowledgeChunks)
        .map((chunk) => ({
            ...chunk,
            content: trimChunkContent(chunk.content, intentProfile.maxChunkChars, message),
        }));

    const knowledgeCharBudget = Math.max(
        120,
        Math.floor(intentProfile.maxChunkChars * intentProfile.maxKnowledgeChunks * 0.8)
    );
    const knowledgeContextBuild = shouldUseKnowledge
        ? buildKnowledgeBaseContext(limitedKnowledgeChunks, knowledgeCharBudget, message)
        : { text: "", usedChunks: 0, skippedChunks: 0 };
    const knowledgeBaseContext = knowledgeContextBuild.text;

    let systemPrompt = buildSystemPrompt(visitorName);

    if (!shouldUseKnowledge || limitedKnowledgeChunks.length === 0) {
        systemPrompt += "You do not have access to knowledge base content. " +
            "If asked a question, politely inform the user that you need knowledge base content to provide accurate answers. " +
            "Do not provide speculative or generic answers.";
    }

    messages.push({
        role: "system",
        content: systemPrompt
    });

    const contextParts: string[] = [];
    if (sectionContext) {
        contextParts.push(`SC: ${sectionContext}`);
    }
    if (knowledgeBaseContext) {
        contextParts.push(knowledgeBaseContext);
    }
    const contextMessage = contextParts.join("\n\n");

    if (contextMessage) {
        messages.push({
            role: "system",
            content: `Use only the following knowledge/context to answer the user.\n${contextMessage}`
        });
    }

    const shouldUseChatHistory =
        !!chatContext?.length &&
        intentProfile.maxContextMessages > 0 &&
        isLikelyFollowUpMessage(message);
    const chatHistoryCharBudget = Math.max(100, intentProfile.maxContextMessages * 180);
    const chatHistoryBuild = shouldUseChatHistory
        ? buildChatHistoryContext(
            chatContext || [],
            intentProfile.maxContextMessages,
            180,
            chatHistoryCharBudget
        )
        : {
            messages: [],
            usedMessages: 0,
            skippedMessages: chatContext?.length ?? 0,
        };
    for (const historyMessage of chatHistoryBuild.messages) {
        messages.push(historyMessage);
    }

    messages.push({
        role: "user",
        content: message
    });

    const contextWrapperText = contextMessage
        ? `Use only the following knowledge/context to answer the user.\n${contextMessage}`
        : "";
    const estimatedTokenBreakdown = {
        system: estimateTokenCount(systemPrompt),
        contextWrapper: estimateTokenCount(contextWrapperText),
        sectionContext: estimateTokenCount(sectionContext ? `SC: ${sectionContext}` : ""),
        knowledge: estimateTokenCount(knowledgeBaseContext),
        chatHistory: chatHistoryBuild.messages.reduce((sum, msg) => sum + estimateTokenCount(msg.content), 0),
        latestUserMessage: estimateTokenCount(message),
        estimatedPromptTotal: messages.reduce((sum, msg) => sum + estimateTokenCount(msg.content), 0),
    };
    log.debug("[OpenAI] Estimated prompt tokens", { model, estimatedTokenBreakdown });

    try {
        const result = await retryWithBackoff(async () => {
            return await client.chat.completions.create({
                model,
                messages,
                temperature: 0.2,
                max_completion_tokens: intentProfile.maxCompletionTokens,
            });
        });

        const text = result.choices[0]?.message?.content?.trim();
        if (!text) {
            return {
                text: "I am not sure how to answer that. Could you please rephrase your question?",
                generatedByAi: false,
                usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            };
        }
        const usage = {
            promptTokens: result.usage?.prompt_tokens ?? 0,
            completionTokens: result.usage?.completion_tokens ?? 0,
            totalTokens: result.usage?.total_tokens ?? 0,
        };
        return {
            text: sanitizeReplyForChat(text),
            generatedByAi: true,
            usage,
        };
    } catch (error: any) {
        if (error?.status === 503 || error?.message?.includes("overloaded") || error?.message?.includes("server_error")) {
            log.error("[OpenAI] Service overloaded, returning fallback message");
            return {
                text: "I'm currently experiencing high demand. Please try again in a moment, or feel free to contact our support team directly.",
                generatedByAi: false,
                usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            };
        }

        if (error?.status === 429 || error?.message?.includes("quota") || error?.message?.includes("rate_limit") || error?.message?.includes("429")) {
            const quotaMessage = error?.message?.includes("free_tier") || error?.message?.includes("insufficient_quota")
                ? "I've reached my daily response limit. Please try again tomorrow or contact support for assistance."
                : "I've reached my response limit. Please try again in a few moments.";
            log.warn("[OpenAI] Rate limit/quota exceeded:", error?.message || "Unknown quota error");
            return {
                text: quotaMessage,
                generatedByAi: false,
                usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            };
        }

        if (error?.status === 401 || error?.status === 403) {
            log.error("[OpenAI] Authentication error");
            return {
                text: "The AI service is not properly configured. Please contact support.",
                generatedByAi: false,
                usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            };
        }

        log.error("[OpenAI] Error generating reply:", error?.message || error);
        return {
            text: "I apologize, but I'm having trouble processing your request right now. Please try again in a moment or contact our support team for assistance.",
            generatedByAi: false,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
    }
}

