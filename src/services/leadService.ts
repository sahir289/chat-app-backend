import { leadRepository } from "../repositories/leadRepository";
import { chatRepository } from "../repositories/chatRepository";
import { propertyRepository } from "../repositories/propertyRepository";
import { AppError } from "../utils/appError";
import { leadPayloadSchema } from "../validations/leadValidation";
import prisma from "../lib/prisma";
import { crmService } from "./crm/crm.service";
import { z } from "zod";

export const leadService = {
  async createLead(data: {
    chatId: string;
    widgetKey: string;
    sessionId: string;
    fullName: string;
    email: string;
    phone: string;
  }): Promise<{
    id: string;
    companyId: string;
    fullName: string;
    email: string;
    phone: string | null;
    source: string;
    channel: string;
    status: string;
  }> {
    const parsed = leadPayloadSchema.safeParse(data);
    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message || "Invalid lead data", {
        errors: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const normalizedData = parsed.data;
    const chat = await chatRepository.findById(normalizedData.chatId);
    if (!chat) {
      throw new AppError(404, "Chat not found");
    }

    const property = await propertyRepository.findByWidgetKey(normalizedData.widgetKey);
    if (!property || property.id !== chat.propertyId) {
      throw new AppError(403, "Widget does not match this chat");
    }
    if (chat.sessionId !== normalizedData.sessionId) {
      throw new AppError(403, "Session does not match this chat");
    }

    const existingLead = await leadRepository.findByChatId(normalizedData.chatId, chat.companyId);
    if (existingLead) {
      throw new AppError(400, "Lead already exists for this chat");
    }

    // Update visitor with lead information (name, email, phone) for AI personalization
    let visitorId: string | null = null;
    if (chat.visitorId) {
      await prisma.visitor.update({
        where: { id: chat.visitorId },
        data: {
          name: normalizedData.fullName,
          email: normalizedData.email,
          phone: normalizedData.phone,
        },
      });
      visitorId = chat.visitorId;
    }

    const lead = await leadRepository.create({
      companyId: chat.companyId,
      chatId: normalizedData.chatId,
      propertyId: chat.propertyId,
      fullName: normalizedData.fullName,
      email: normalizedData.email,
      phone: normalizedData.phone,
      status: "NEW",
      source: "WEBSITE",
      channel: "web_widget",
      visitorId: visitorId,
    });

    crmService.enqueueLeadSync({
      companyId: chat.companyId,
      leadId: lead.id,
      trigger: "LEAD_CREATED",
    });

    return {
      id: lead.id,
      companyId: chat.companyId,
      fullName: lead.fullName,
      email: lead.email,
      phone: lead.phone,
      source: lead.source.toLowerCase(),
      channel: resolveLeadChannel(lead),
      status: lead.status,
    };
  },

  async createManualLead(params: {
    companyId: string;
    propertyId: string;
    fullName: string;
    email: string;
    phone?: string;
  }): Promise<{ id: string; fullName: string; email: string; phone: string | null; source: string; channel: string; status: string }> {
    const property = await propertyRepository.findById(params.propertyId, params.companyId);
    if (!property) {
      throw new AppError(404, "Property not found");
    }

    const lead = await leadRepository.create({
      companyId: params.companyId,
      propertyId: params.propertyId,
      chatId: null,
      fullName: params.fullName,
      email: params.email,
      phone: params.phone ?? null,
      status: "NEW",
      source: "MANUAL",
      channel: "manual",
    });

    crmService.enqueueLeadSync({
      companyId: params.companyId,
      leadId: lead.id,
      trigger: "LEAD_CREATED",
    });

    return {
      id: lead.id,
      fullName: lead.fullName,
      email: lead.email,
      phone: lead.phone,
      source: lead.source.toLowerCase(),
      channel: resolveLeadChannel(lead),
      status: lead.status,
    };
  },

  async importManualLeadsFromCsv(params: {
    companyId: string;
    propertyId: string;
    csvText: string;
  }): Promise<{
    created: number;
    failed: number;
    totalRows: number;
    warnings: Array<{ row: number; message: string }>;
  }> {
    const property = await propertyRepository.findById(params.propertyId, params.companyId);
    if (!property) {
      throw new AppError(404, "Property not found");
    }

    const parsedRows = parseCsv(params.csvText);
    if (parsedRows.length < 2) {
      throw new AppError(400, "CSV file must include a header row and at least one lead row");
    }

    const headers = parsedRows[0].map(normalizeCsvHeader);
    const headerIndex = new Map(headers.map((header, index) => [header, index]));
    const getIndex = (...names: string[]) => {
      for (const name of names) {
        const index = headerIndex.get(name);
        if (index !== undefined) return index;
      }
      return -1;
    };

    const fullNameIndex = getIndex("fullname", "name", "leadname", "full name", "lead name");
    const emailIndex = getIndex("email", "emailaddress", "email address");
    const phoneIndex = getIndex("phone", "mobile", "phone number", "phonenumber");
    const companyNameIndex = getIndex("companyname", "company", "company name");
    const notesIndex = getIndex("notes", "note", "message");

    if (fullNameIndex === -1 || emailIndex === -1) {
      throw new AppError(400, "CSV headers must include fullName/name and email");
    }

    const warnings: Array<{ row: number; message: string }> = [];
    let created = 0;
    const dataRows = parsedRows.slice(1).filter((row) => row.some((cell) => cell.trim()));
    const maxRows = 500;

    if (dataRows.length > maxRows) {
      throw new AppError(400, `CSV import supports up to ${maxRows} lead rows at a time`);
    }

    for (let index = 0; index < dataRows.length; index += 1) {
      const row = dataRows[index];
      const rowNumber = index + 2;
      const fullName = (row[fullNameIndex] ?? "").trim();
      const email = (row[emailIndex] ?? "").trim();
      const rawPhone = phoneIndex >= 0 ? (row[phoneIndex] ?? "").trim() : "";
      const companyName = companyNameIndex >= 0 ? (row[companyNameIndex] ?? "").trim() : "";
      const notes = notesIndex >= 0 ? (row[notesIndex] ?? "").trim() : "";

      const validation = manualLeadImportRowSchema.safeParse({
        fullName,
        email,
        phone: rawPhone || undefined,
        companyName: companyName || undefined,
        notes: notes || undefined,
      });

      if (!validation.success) {
        warnings.push({
          row: rowNumber,
          message: validation.error.issues[0]?.message ?? "Invalid lead row",
        });
        continue;
      }

      const lead = await leadRepository.create({
        companyId: params.companyId,
        propertyId: params.propertyId,
        chatId: null,
        fullName: validation.data.fullName,
        email: validation.data.email,
        phone: validation.data.phone ?? null,
        companyName: validation.data.companyName ?? null,
        notes: validation.data.notes ?? null,
        status: "NEW",
        source: "MANUAL",
        channel: "manual",
      });

      crmService.enqueueLeadSync({
        companyId: params.companyId,
        leadId: lead.id,
        trigger: "LEAD_CREATED",
      });
      created += 1;
    }

    return {
      created,
      failed: dataRows.length - created,
      totalRows: dataRows.length,
      warnings,
    };
  },

  async getLeadByChatId(chatId: string, companyId: string): Promise<{ id: string; fullName: string; email: string; phone: string | null; source: string; channel: string; status: string } | null> {
    const lead = await leadRepository.findByChatId(chatId, companyId);
    if (!lead) {
      return null;
    }

    return {
      id: lead.id,
      fullName: lead.fullName,
      email: lead.email,
      phone: lead.phone,
      source: lead.source.toLowerCase(),
      channel: resolveLeadChannel(lead),
      status: lead.status,
    };
  },

  async getLeadsByProperty(companyId: string, propertyId: string): Promise<Array<{
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    source: string;
    channel: string;
    status: string;
    chatId: string | null;
    createdAt: Date;
  }>> {
    const leads = await leadRepository.findByPropertyId(propertyId, companyId);
    return leads.map((lead) => ({
      id: lead.id,
      fullName: lead.fullName,
      email: lead.email,
      phone: lead.phone,
      source: lead.source.toLowerCase(),
      channel: resolveLeadChannel(lead),
      status: lead.status,
      chatId: lead.chatId,
      createdAt: lead.createdAt,
    }));
  },
};

const manualLeadImportRowSchema = leadPayloadSchema
  .omit({ chatId: true, widgetKey: true, sessionId: true })
  .extend({
  phone: leadPayloadSchema.shape.phone.optional(),
  companyName: z.string().trim().max(100, "Company name must be 100 characters or fewer").optional(),
  notes: z.string().trim().max(1000, "Notes must be 1000 characters or fewer").optional(),
});

function normalizeCsvHeader(value: string): string {
  return value.trim().replace(/^\uFEFF/, "").toLowerCase().replace(/[_-]/g, "").replace(/\s+/g, " ");
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim())) {
    rows.push(row);
  }

  return rows;
}

function resolveLeadChannel(lead: unknown): string {
  if (lead && typeof lead === "object" && "channel" in lead) {
    const value = (lead as { channel?: unknown }).channel;
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return "web_widget";
}
