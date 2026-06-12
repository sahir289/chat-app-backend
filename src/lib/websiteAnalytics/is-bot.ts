const BOT_USER_AGENT_PATTERN =
    /bot|crawler|spider|crawling|facebookexternalhit|slurp|bingpreview/i;

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
    if (!userAgent) {
        return false;
    }

    return BOT_USER_AGENT_PATTERN.test(userAgent);
}
