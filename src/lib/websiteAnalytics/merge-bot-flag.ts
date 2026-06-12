/**
 * Once a visitor/session is classified as a bot, keep that classification (do not downgrade to human).
 */
export function mergeBotFlag(existingIsBot: boolean, detectedIsBot: boolean): boolean {
    return existingIsBot || detectedIsBot;
}
