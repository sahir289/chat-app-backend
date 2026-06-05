import OpenAI from "openai";
import { config } from "../config";
import { isAllowedOpenAiChatModelId } from "../utils/openaiChatModelResolver";

/**
 * Keep only models suitable for chatbot text replies.
 * - Allow conversational/reasoning families (gpt-*, chatgpt-*, o*)
 * - Exclude non-chat categories (embeddings, audio/speech, images, moderation, realtime, search, video, codex)
 */
export function isLikelyChatCompletionModel(id: string): boolean {
    return isAllowedOpenAiChatModelId(id);
}

export async function listOpenAiModelsForSuperAdminCatalog(): Promise<Array<{ id: string; created: number }>> {
    const apiKey = config.openai.proApiKey;
    if (!apiKey) {
        throw new Error("OPENAI_PRO_API_KEY is not configured");
    }
    const client = new OpenAI({ apiKey });
    const response = await client.models.list();
    const data = response.data ?? [];
    return data
        .filter((m) => m?.id && isLikelyChatCompletionModel(m.id))
        .map((m) => ({ id: m.id, created: typeof m.created === "number" ? m.created : 0 }))
        .sort((a, b) => {
            if (b.created !== a.created) return b.created - a.created;
            return b.id.localeCompare(a.id, undefined, { numeric: true, sensitivity: "base" });
        });
}
