import { UserSettings } from "@prisma/client";

export function toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function isValidHttpUrl(value: string): boolean {
    return value.startsWith("http://") || value.startsWith("https://");
}

export function transformSettingsForApi(settings: UserSettings) {
    return {
        ...settings,
        chatSound: settings.chatSound.toLowerCase(),
        theme: settings.theme.toLowerCase(),
    };
}