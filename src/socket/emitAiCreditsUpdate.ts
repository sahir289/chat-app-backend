import { getIO } from "./index";
import { broadcastAiCreditsUpdate } from "./roomManager";

/** Fire-and-forget; safe if Socket.io is not initialized (e.g. tests). */
export function emitAiCreditsUpdated(companyId: string): void {
    try {
        broadcastAiCreditsUpdate(getIO(), companyId);
    } catch {
        // non-blocking
    }
}
