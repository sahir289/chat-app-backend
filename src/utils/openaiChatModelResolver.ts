import { config } from "../config";

/** Typical OpenAI model id shape — avoids passing arbitrary strings to the API */
export function isValidOpenAiModelId(id: string): boolean {
    if (!id || id.length > 128) return false;
    return /^[a-zA-Z0-9._-]+$/.test(id);
}

/**
 * Keep only chat/reasoning model IDs that are safe for tenant selection.
 * Mirrors the super-admin catalog filtering so legacy DB values are also normalized.
 */
export function isAllowedOpenAiChatModelId(id: string): boolean {
    if (!isValidOpenAiModelId(id)) return false;
    const lower = id.toLowerCase();

    const isAllowedChatFamily = /^(gpt-|chatgpt-|o\d+(\b|-|\.|$))/i.test(lower);
    if (!isAllowedChatFamily) return false;

    const deniedTerms = [
        "embedding",
        "moderation",
        "realtime",
        "search",
        "codex",
        "audio",
        "speech",
        "tts",
        "whisper",
        "transcribe",
        "image",
        "dall-e",
        "imagen",
        "sora",
        "preview",
        "instruct",
    ];
    if (deniedTerms.some((term) => lower.includes(term))) return false;

    // Hide dated snapshots and pro variants from tenant model selection.
    if (/\d{4}-\d{2}-\d{2}$/.test(lower)) return false;
    if (lower.includes("-pro")) return false;

    if (
        lower === "gpt-3.5-turbo" ||
        lower.startsWith("gpt-3.5-") ||
        lower === "gpt-4" ||
        lower === "gpt-4-turbo" ||
        lower.startsWith("gpt-4-turbo-") ||
        lower === "gpt-4-0613"
    ) {
        return false;
    }

     // Hide from normal company chatbot selection
     if (
        lower === "gpt-5-chat-latest" ||
        lower === "gpt-5.1-chat-latest" ||
        lower === "gpt-5.2-chat-latest" ||
        lower === "gpt-5.3-chat-latest" ||
        lower === "o1" ||
        lower === "o3" ||
        lower === "o3-mini" ||
        lower === "o4-mini"
    ) {
        return false;
    }

    return true;
}

export function sanitizeOpenAiModelIdList(ids: string[] | undefined): string[] {
    if (!ids?.length) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of ids) {
        const id = typeof raw === "string" ? raw.trim() : "";
        if (!id || !isAllowedOpenAiChatModelId(id)) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out.slice(0, 64);
}

export function resolveEffectiveOpenAiChatModel(params: {
    isPro: boolean;
    allowedModelIds: string[];
    propertySelectedModelId: string | null | undefined;
    envFallback: string;
}): string {
    const { isPro, allowedModelIds, propertySelectedModelId, envFallback } = params;
    const fallback =
        envFallback && isValidOpenAiModelId(envFallback) ? envFallback : "gpt-5.4-mini";

    if (!isPro) {
        return fallback;
    }

    if (allowedModelIds.length === 0) {
        return fallback;
    }

    if (propertySelectedModelId && allowedModelIds.includes(propertySelectedModelId)) {
        return propertySelectedModelId;
    }

    if (allowedModelIds.length === 1) {
        return allowedModelIds[0];
    }

    return fallback;
}

export function defaultOpenAiChatFallback(): string {
    const m = config.openai.chatModel;
    return m && isValidOpenAiModelId(m) ? m : "gpt-5.4-mini";
}
