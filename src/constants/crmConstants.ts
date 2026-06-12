import { CrmProvider } from "@prisma/client";

export type CrmTargetFieldOption = { key: string; label: string; required?: boolean };

export type CrmChatbotFieldOption = { key: string; label: string };

/** Shared default chatbot → CRM field map (webhook and non-HubSpot providers). */
export const CRM_BASE_DEFAULT_MAPPINGS: Record<string, string> = {
  "visitor.name": "firstname",
  "visitor.userId": "user_id",
  "visitor.email": "email",
  "visitor.phone": "phone",
  "lead.companyName": "company",
  "lead.source": "lead_source",
  "lead.channel": "lead_channel",
  "lead.status": "lead_status",
};

/** HubSpot adds internal lead id → custom HubSpot property. */
export const CRM_HUBSPOT_DEFAULT_MAPPINGS: Record<string, string> = {
  ...CRM_BASE_DEFAULT_MAPPINGS,
  "lead.id": "chatbot_lead_id",
};

export function getCrmDefaultMappings(provider: CrmProvider): Record<string, string> {
  return provider === CrmProvider.HUBSPOT ? CRM_HUBSPOT_DEFAULT_MAPPINGS : CRM_BASE_DEFAULT_MAPPINGS;
}

export const CRM_PROVIDER_FIELDS: Record<CrmProvider, CrmTargetFieldOption[]> = {
  WEBHOOK: [
    { key: "firstname", label: "First name" },
    { key: "email", label: "Email", required: true },
    { key: "phone", label: "Phone" },
    { key: "lead_source", label: "Lead source" },
    { key: "lead_channel", label: "Lead channel" },
    { key: "lead_status", label: "Lead status" },
    { key: "notes", label: "Notes" },
    { key: "chatbot_lead_id", label: "Chatbot lead ID" },
    { key: "chatbot_workspace_id", label: "Chatbot workspace ID" },
    { key: "chatbot_session_id", label: "Chatbot session ID" },
  ],
  HUBSPOT: [
    { key: "firstname", label: "First name" },
    { key: "lastname", label: "Last name" },
    { key: "email", label: "Email", required: true },
    { key: "phone", label: "Phone" },
    { key: "company", label: "Company" },
    { key: "website", label: "Website" },
    { key: "jobtitle", label: "Job title" },
    { key: "lifecyclestage", label: "Lifecycle stage" },
    { key: "chatbot_lead_id", label: "Chatbot lead ID (custom)" },
    { key: "lead_source", label: "Lead source (custom)" },
    { key: "lead_channel", label: "Lead channel (custom)" },
    { key: "lead_status", label: "Lead status (custom)" },
  ],
  ZOHO: [],
  SALESFORCE: [],
  PIPEDRIVE: [],
  FRESHSALES: [],
};

export const CRM_CHATBOT_FIELDS: CrmChatbotFieldOption[] = [
  { key: "visitor.name", label: "Lead name" },
  { key: "visitor.email", label: "Email" },
  { key: "visitor.userId", label: "User ID" },
  { key: "visitor.phone", label: "Phone" },
  { key: "lead.companyName", label: "Company name" },
  { key: "lead.id", label: "Lead ID" },
  { key: "lead.source", label: "Source" },
  { key: "lead.channel", label: "Channel" },
  { key: "lead.status", label: "Status" },
  { key: "lead.message", label: "Lead message" },
  { key: "chat.id", label: "Chat ID" },
  { key: "chat.summary", label: "Chat summary" },
  { key: "chat.transcript", label: "Chat transcript" },
  { key: "chat.assignedAgentName", label: "Assigned agent name" },
  { key: "chat.sessionId", label: "Chat session ID" },
  { key: "workspace.id", label: "Workspace ID" },
  { key: "tracking.pageUrl", label: "Page URL" },
  { key: "tracking.browser", label: "Browser" },
  { key: "tracking.device", label: "Device" },
  { key: "tracking.country", label: "Country" },
  { key: "tracking.city", label: "City" },
  { key: "custom.propertyName", label: "Custom property name" },
  { key: "custom.propertyDomain", label: "Custom property domain" },
];
