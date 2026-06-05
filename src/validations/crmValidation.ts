import { z } from "zod";
import { CrmLeadSource, CrmProvider, CrmSyncStatus } from "@prisma/client";
import { CRM_BULK_SYNC_MAX_LEAD_IDS } from "../services/crm/crm-bulk-sync";
import { CRM_CONNECT_PROVIDERS } from "../services/crm/crm.types";

function prismaEnumValues<T extends string>(enumObject: Record<string, T>): [T, ...T[]] {
  const values = Object.values(enumObject) as T[];
  if (values.length === 0) {
    throw new Error("Prisma enum object has no values");
  }
  return [values[0], ...values.slice(1)];
}

const CRM_PROVIDERS = prismaEnumValues(CrmProvider);

const CRM_LEAD_SOURCES = prismaEnumValues(CrmLeadSource);

const CRM_SYNC_STATUSES = prismaEnumValues(CrmSyncStatus);

const BACKFILL_SOURCES = [
  CrmLeadSource.WEBSITE,
  CrmLeadSource.MANUAL,
  CrmLeadSource.WHATSAPP,
] as const;

function uppercaseOptional<T extends readonly string[]>(allowed: T) {
  return z.preprocess((v) => {
    if (v === undefined || v === null || v === "") return undefined;
    const s = Array.isArray(v) ? v[0] : v;
    return String(s).trim().toUpperCase();
  }, z.enum(allowed as unknown as [T[number], ...T[number][]]).optional());
}

function uppercaseRequired<T extends readonly string[]>(allowed: T) {
  return z.preprocess(
    (v) => String(v ?? "").trim().toUpperCase(),
    z.enum(allowed as unknown as [T[number], ...T[number][]])
  );
}

export const crmProviderSchema = uppercaseRequired(CRM_PROVIDERS);

const crmLeadSyncProviderSchema = uppercaseRequired(CRM_CONNECT_PROVIDERS);

const crmLeadSourceSchema = uppercaseRequired(CRM_LEAD_SOURCES);

const fieldMappingRecordSchema = z
  .record(z.string(), z.string())
  .superRefine((mappings, ctx) => {
    if (Object.keys(mappings).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "mappings must be a non-empty object",
      });
      return;
    }
    const sourceFields = new Set<string>();
    const destinationFields = new Set<string>();
    for (const [sourceField, targetField] of Object.entries(mappings)) {
      if (!sourceField.trim() || !targetField.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Each mapping must have a source field and CRM field",
        });
        return;
      }
      if (sourceFields.has(sourceField)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate chatbot/source fields are not allowed",
        });
        return;
      }
      if (destinationFields.has(targetField)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate CRM destination fields are not allowed",
        });
        return;
      }
      sourceFields.add(sourceField);
      destinationFields.add(targetField);
    }
  });

const nullToUndef = <S extends z.ZodTypeAny>(schema: S) =>
  z.preprocess((v) => (v == null ? undefined : v), schema);

const connectBodyUnion = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal(CrmProvider.WEBHOOK),
    webhookUrl: z.string().trim().min(1, "webhookUrl is required"),
    webhookSecret: nullToUndef(z.string().optional()),
    generateWebhookSecret: nullToUndef(z.boolean().optional()),
  }),
  z.object({
    provider: z.literal(CrmProvider.HUBSPOT),
    serviceKeyToken: z.string().trim().min(1, "serviceKeyToken is required"),
    portalId: nullToUndef(z.string().optional()),
  }),
]);

export const connectCrmIntegrationSchema = z.object({
  body: z.preprocess((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
    const o = { ...(raw as Record<string, unknown>) };
    if (typeof o.provider === "string") {
      o.provider = o.provider.trim().toUpperCase();
    }
    return o;
  }, connectBodyUnion),
});

export const setPrimaryLeadSyncProviderSchema = z.object({
  body: z.object({
    provider: crmLeadSyncProviderSchema,
  }),
});

export const disconnectCrmIntegrationSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1),
  }),
});

export const testCrmWebhookSchema = z.object({
  body: z.object({
    provider: uppercaseOptional(CRM_PROVIDERS),
  }),
});

export const syncLeadToCrmSchema = z.object({
  params: z.object({
    leadId: z.string().trim().min(1),
  }),
  body: z.object({
    provider: uppercaseOptional(CRM_PROVIDERS),
  }),
});

export const syncLeadsBulkToCrmSchema = z.object({
  body: z.object({
    leadIds: z
      .array(z.string().trim().min(1))
      .min(1)
      .max(CRM_BULK_SYNC_MAX_LEAD_IDS),
    provider: uppercaseOptional(CRM_PROVIDERS),
  }),
});

export const backfillUnsyncedLeadsToCrmSchema = z.object({
  body: z.object({
    provider: uppercaseOptional(CRM_PROVIDERS),
    source: z.preprocess((v) => {
      if (v === undefined || v === null || v === "") return undefined;
      return String(v).trim().toUpperCase();
    }, z.enum(BACKFILL_SOURCES).optional()),
    propertyId: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

export const listCrmSyncLogsSchema = z.object({
  query: z.object({
    provider: uppercaseOptional(CRM_PROVIDERS),
    status: uppercaseOptional(CRM_SYNC_STATUSES),
    leadId: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export const getCrmFieldsSchema = z.object({
  params: z.object({
    provider: crmProviderSchema,
  }),
});

export const saveCrmFieldMappingSchema = z.object({
  body: z.object({
    provider: crmProviderSchema,
    source: crmLeadSourceSchema,
    mappings: fieldMappingRecordSchema,
  }),
});

export const listCrmFieldMappingsSchema = z.object({
  query: z.object({
    provider: uppercaseOptional(CRM_PROVIDERS),
  }),
});
