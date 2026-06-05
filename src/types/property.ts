export interface PropertyDTO {
    id: string;
    name: string;
    domain: string | null;
    widgetKey: string;
    createdAt: Date;
    chatbotName?: string | null;
    chatbotLogo?: string | null;
    launcherButtonColor?: string | null;
    primaryColor?: string | null;
    backgroundColor?: string | null;
    textColor?: string | null;
    leftMessageBackgroundColor?: string | null;
    leftMessageTextColor?: string | null;
    rightMessageBackgroundColor?: string | null;
    rightMessageTextColor?: string | null;
    welcomeMessage?: string | null;
    position?: string | null;
    aiEnabled?: boolean;
    removeBranding?: boolean;
    openAiChatModelId?: string | null;
    allowedOpenAiChatModels?: string[];
    /** Model that will actually be used (platform fallback if none assigned). */
    effectiveOpenAiChatModelId?: string;
}

export interface PropertySettingsDTO {
    chatbotName?: string | null;
    chatbotLogo?: string | null;
    launcherButtonColor?: string | null;
    primaryColor?: string | null;
    backgroundColor?: string | null;
    textColor?: string | null;
    leftMessageBackgroundColor?: string | null;
    leftMessageTextColor?: string | null;
    rightMessageBackgroundColor?: string | null;
    rightMessageTextColor?: string | null;
    welcomeMessage?: string | null;
    position?: string | null;
    aiEnabled?: boolean;
    removeBranding?: boolean;
}


