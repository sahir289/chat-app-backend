import {
  CrmProvider,
  type CrmLeadSource,
  type CrmSyncAction,
  type CrmSyncTrigger,
} from "@prisma/client";

/** Providers allowed for `connectIntegration` and primary lead-sync selection (from Prisma `CrmProvider`). */
export const CRM_CONNECT_PROVIDERS = [CrmProvider.WEBHOOK, CrmProvider.HUBSPOT] as const;
export type CrmConnectProvider = (typeof CRM_CONNECT_PROVIDERS)[number];

export type NormalizedCrmLead = {
  workspaceId: string;
  leadId: string;
  source: CrmLeadSource;
  channel: string;
  name: string;
  email: string | null;
  userId: string | null;
  phone: string | null;
  companyName: string | null;
  message: string | null;
  pageUrl: string | null;
  browser: string | null;
  device: string | null;
  country: string | null;
  city: string | null;
  chatSessionId: string | null;
  chatId: string | null;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  status: string;
  tags: string[];
  customFields: Record<string, unknown>;
  chatSummary: string | null;
  transcript: string | null;
};

export type CrmProviderSyncInput = {
  provider: CrmProvider;
  action: CrmSyncAction;
  trigger: CrmSyncTrigger;
  event: string;
  lead: NormalizedCrmLead;
  mappedFields: Record<string, unknown>;
  existingCrmContactId?: string | null;
};

export type CrmProviderSyncResult = {
  success: boolean;
  crmContactId?: string | null;
  crmDealId?: string | null;
  responsePayload?: unknown;
};

export interface CrmProviderClient {
  testConnection(): Promise<CrmProviderSyncResult>;
  syncLead(input: CrmProviderSyncInput): Promise<CrmProviderSyncResult>;
}
