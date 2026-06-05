import type { CrmProvider, CrmSyncAction, CrmSyncTrigger, Prisma } from "@prisma/client";

/**
 * Persist only non-sensitive metadata in CrmSyncLog.requestPayload (no transcript, summary, messages, or field values).
 */
export function buildCrmSyncRequestLogMetadata(params: {
  event: string;
  provider: CrmProvider;
  action: CrmSyncAction;
  leadId?: string | null;
  chatId?: string | null;
  trigger: CrmSyncTrigger;
  mappingSourceFieldCount: number;
  mappedCrmFieldKeys: string[];
  transcriptCharCount: number;
  hasChatSummary: boolean;
  hasLeadMessage: boolean;
}): Prisma.InputJsonValue {
  return {
    event: params.event,
    provider: params.provider,
    action: params.action,
    leadId: params.leadId ?? null,
    chatId: params.chatId ?? null,
    trigger: params.trigger,
    mappingSourceFieldCount: params.mappingSourceFieldCount,
    mappedCrmFieldKeys: params.mappedCrmFieldKeys.slice(0, 80),
    transcriptCharCount: params.transcriptCharCount,
    hasChatSummary: params.hasChatSummary,
    hasLeadMessage: params.hasLeadMessage,
  };
}
