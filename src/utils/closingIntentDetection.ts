/**
 * Detects if a visitor message indicates they want to end the chat
 * Keywords that suggest positive resolution or completion
 */
export function detectClosingIntent(message: string): boolean {
    if (!message || typeof message !== "string") {
        return false;
    }

    const normalizedMessage = message.toLowerCase().trim();
    
    // Positive closing keywords
    const closingKeywords = [
        "thanks",
        "thank you",
        "resolved",
        "solved",
        "fixed",
        "ok",
        "okay",
        "done",
        "works now",
        "working now",
        "all set",
        "all good",
        "perfect",
        "great",
        "awesome",
        "appreciate it",
        "got it",
        "understood",
        "that's all",
        "that's it",
        "nothing else",
        "no more questions",
        "no further help",
    ];

    // Check if message contains any closing keywords
    return closingKeywords.some(keyword => normalizedMessage.includes(keyword));
}

/**
 * Generates a polite closing message from AI/Agent
 */
export function getClosingMessage(): string {
    const messages = [
        "I'm glad I could help! If you have any other questions, feel free to reach out anytime.",
        "Great! I'm happy to hear that. Don't hesitate to contact us if you need anything else.",
        "Perfect! If there's anything else you need assistance with, just let us know.",
        "Excellent! We're here whenever you need us. Have a wonderful day!",
    ];
    
    // Return a random closing message for variety
    return messages[Math.floor(Math.random() * messages.length)];
}

