import { Role, type BusinessHours } from "@prisma/client";
import { DateTime } from "luxon";
import prisma from "../lib/prisma";
import { chatRepository } from "../repositories/chatRepository";
import { propertyRepository } from "../repositories/propertyRepository";
import { getOnlineAgentIdsForProperty } from "../socket";
import { aiCreditsService } from "./aiCreditsService";

type WeekdayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type ConversationHandler = "agent" | "ai" | "offline";

export type ConversationRoutingReason =
  | "chat_assigned_to_agent"
  | "agent_available"
  | "outside_business_hours"
  | "no_eligible_agent"
  | "ai_disabled"
  | "not_pro_plan"
  | "no_ai_credits"
  | "property_not_found"
  | "chat_not_found";

export type BusinessHoursPayload = {
  enabled: boolean;
  timezone: string;
  mondayEnabled: boolean;
  mondayStart: string | null;
  mondayEnd: string | null;
  tuesdayEnabled: boolean;
  tuesdayStart: string | null;
  tuesdayEnd: string | null;
  wednesdayEnabled: boolean;
  wednesdayStart: string | null;
  wednesdayEnd: string | null;
  thursdayEnabled: boolean;
  thursdayStart: string | null;
  thursdayEnd: string | null;
  fridayEnabled: boolean;
  fridayStart: string | null;
  fridayEnd: string | null;
  saturdayEnabled: boolean;
  saturdayStart: string | null;
  saturdayEnd: string | null;
  sundayEnabled: boolean;
  sundayStart: string | null;
  sundayEnd: string | null;
  holidays?: unknown;
};

export type ConversationRoutingDecision = {
  handler: ConversationHandler;
  reason: ConversationRoutingReason;
  businessHoursOpen: boolean;
  eligibleAgentAvailable: boolean;
  eligibleAgentIds: string[];
  aiEnabled: boolean;
  isPro: boolean;
  hasAiCredits: boolean;
};

const DEFAULT_BUSINESS_HOURS: BusinessHoursPayload = {
  enabled: false,
  timezone: "Asia/Kolkata",
  mondayEnabled: true,
  mondayStart: "10:00",
  mondayEnd: "19:00",
  tuesdayEnabled: true,
  tuesdayStart: "10:00",
  tuesdayEnd: "19:00",
  wednesdayEnabled: true,
  wednesdayStart: "10:00",
  wednesdayEnd: "19:00",
  thursdayEnabled: true,
  thursdayStart: "10:00",
  thursdayEnd: "19:00",
  fridayEnabled: true,
  fridayStart: "10:00",
  fridayEnd: "19:00",
  saturdayEnabled: false,
  saturdayStart: null,
  saturdayEnd: null,
  sundayEnabled: false,
  sundayStart: null,
  sundayEnd: null,
};

const WEEKDAY_BY_LUXON_NUMBER: Record<number, WeekdayKey> = {
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
  7: "sunday",
};

function normalizeBusinessHours(hours: BusinessHours | null): BusinessHoursPayload {
  if (!hours) {
    return DEFAULT_BUSINESS_HOURS;
  }

  return {
    enabled: hours.enabled ?? DEFAULT_BUSINESS_HOURS.enabled,
    timezone: hours.timezone || DEFAULT_BUSINESS_HOURS.timezone,
    mondayEnabled: hours.mondayEnabled,
    mondayStart: hours.mondayStart,
    mondayEnd: hours.mondayEnd,
    tuesdayEnabled: hours.tuesdayEnabled,
    tuesdayStart: hours.tuesdayStart,
    tuesdayEnd: hours.tuesdayEnd,
    wednesdayEnabled: hours.wednesdayEnabled,
    wednesdayStart: hours.wednesdayStart,
    wednesdayEnd: hours.wednesdayEnd,
    thursdayEnabled: hours.thursdayEnabled,
    thursdayStart: hours.thursdayStart,
    thursdayEnd: hours.thursdayEnd,
    fridayEnabled: hours.fridayEnabled,
    fridayStart: hours.fridayStart,
    fridayEnd: hours.fridayEnd,
    saturdayEnabled: hours.saturdayEnabled,
    saturdayStart: hours.saturdayStart,
    saturdayEnd: hours.saturdayEnd,
    sundayEnabled: hours.sundayEnabled,
    sundayStart: hours.sundayStart,
    sundayEnd: hours.sundayEnd,
    holidays: hours.holidays,
  };
}

function minutesFromTime(value: string | null): number | null {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }
  const [hours, minutes] = value.split(":").map(Number);
  if (
    hours === undefined ||
    minutes === undefined ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

function getZonedDateParts(now: Date, timezone: string): { weekday: WeekdayKey; minutes: number; date: string } {
  let zonedNow = DateTime.fromJSDate(now, {
    zone: timezone || DEFAULT_BUSINESS_HOURS.timezone,
  });

  if (!zonedNow.isValid) {
    zonedNow = DateTime.fromJSDate(now, {
      zone: DEFAULT_BUSINESS_HOURS.timezone,
    });
  }

  const weekday = WEEKDAY_BY_LUXON_NUMBER[zonedNow.weekday] ?? "monday";
  return {
    weekday,
    minutes: zonedNow.hour * 60 + zonedNow.minute,
    date: zonedNow.toISODate() ?? "",
  };
}

function holidaysContainDate(holidays: unknown, date: string): boolean {
  if (!Array.isArray(holidays)) {
    return false;
  }

  return holidays.some((holiday) => {
    if (typeof holiday === "string") {
      return holiday === date;
    }
    if (holiday && typeof holiday === "object" && "date" in holiday) {
      return (holiday as { date?: unknown }).date === date;
    }
    return false;
  });
}

export function isWithinBusinessHours(hours: BusinessHoursPayload, now = new Date()): boolean {
  if (!hours.enabled) {
    return false;
  }

  const { weekday, minutes, date } = getZonedDateParts(now, hours.timezone || "UTC");
  if (holidaysContainDate(hours.holidays, date)) {
    return false;
  }

  const enabled = hours[`${weekday}Enabled` as const];
  const start = minutesFromTime(hours[`${weekday}Start` as const]);
  const end = minutesFromTime(hours[`${weekday}End` as const]);

  if (!enabled || start === null || end === null || start === end) {
    return false;
  }

  if (start < end) {
    return minutes >= start && minutes < end;
  }

  return minutes >= start || minutes < end;
}

async function getEligibleAgentIds(propertyId: string, companyId: string): Promise<string[]> {
  const onlineAgentIds = await getOnlineAgentIdsForProperty(propertyId);
  if (onlineAgentIds.length === 0) {
    return [];
  }

  const agents = await prisma.user.findMany({
    where: {
      id: { in: onlineAgentIds },
      companyId,
      deletedAt: null,
      isActive: true,
      emailVerified: true,
      role: { in: [Role.ADMIN, Role.AGENT] },
      company: {
        isActive: true,
        isSuspended: false,
        deletedAt: null,
      },
      OR: [
        { role: Role.ADMIN },
        {
          role: Role.AGENT,
          agentPropertyAccess: {
            some: { propertyId },
          },
        },
      ],
    },
    select: {
      id: true,
      agentAvailability: {
        select: {
          status: true,
          currentChats: true,
          maxChats: true,
          awayUntil: true,
        },
      },
    },
  });

  const now = new Date();
  return agents
    .filter((agent) => {
      const availability = agent.agentAvailability;
      if (!availability) {
        return true;
      }
      if (availability.status !== "ONLINE") {
        return false;
      }
      if (availability.awayUntil && availability.awayUntil > now) {
        return false;
      }
      return availability.currentChats < availability.maxChats;
    })
    .map((agent) => agent.id);
}

export const conversationRoutingService = {
  defaultBusinessHours: DEFAULT_BUSINESS_HOURS,

  async getBusinessHours(propertyId: string, companyId: string): Promise<BusinessHoursPayload | null> {
    const property = await propertyRepository.findById(propertyId, companyId);
    if (!property) {
      return null;
    }

    const hours = await prisma.businessHours.findUnique({
      where: { propertyId },
    });

    return normalizeBusinessHours(hours);
  },

  async upsertBusinessHours(
    propertyId: string,
    companyId: string,
    input: BusinessHoursPayload
  ): Promise<BusinessHoursPayload | null> {
    const property = await propertyRepository.findById(propertyId, companyId);
    if (!property) {
      return null;
    }

    const data = {
      enabled: input.enabled ?? DEFAULT_BUSINESS_HOURS.enabled,
      timezone: input.timezone || DEFAULT_BUSINESS_HOURS.timezone,
      mondayEnabled: input.mondayEnabled,
      mondayStart: input.mondayStart,
      mondayEnd: input.mondayEnd,
      tuesdayEnabled: input.tuesdayEnabled,
      tuesdayStart: input.tuesdayStart,
      tuesdayEnd: input.tuesdayEnd,
      wednesdayEnabled: input.wednesdayEnabled,
      wednesdayStart: input.wednesdayStart,
      wednesdayEnd: input.wednesdayEnd,
      thursdayEnabled: input.thursdayEnabled,
      thursdayStart: input.thursdayStart,
      thursdayEnd: input.thursdayEnd,
      fridayEnabled: input.fridayEnabled,
      fridayStart: input.fridayStart,
      fridayEnd: input.fridayEnd,
      saturdayEnabled: input.saturdayEnabled,
      saturdayStart: input.saturdayStart,
      saturdayEnd: input.saturdayEnd,
      sundayEnabled: input.sundayEnabled,
      sundayStart: input.sundayStart,
      sundayEnd: input.sundayEnd,
      holidays: input.holidays as any,
    };

    const hours = await prisma.businessHours.upsert({
      where: { propertyId },
      create: {
        propertyId,
        ...data,
      },
      update: data,
    });

    return normalizeBusinessHours(hours);
  },

  async decideHandler(params: {
    propertyId: string;
    companyId: string;
    chatId?: string;
    includeAiCredits?: boolean;
  }): Promise<ConversationRoutingDecision> {
    const [property, company, businessHours] = await Promise.all([
      propertyRepository.findById(params.propertyId, params.companyId),
      prisma.company.findUnique({
        where: { id: params.companyId },
        select: { isPro: true },
      }),
      prisma.businessHours.findUnique({
        where: { propertyId: params.propertyId },
      }),
    ]);

    if (!property) {
      return {
        handler: "offline",
        reason: "property_not_found",
        businessHoursOpen: false,
        eligibleAgentAvailable: false,
        eligibleAgentIds: [],
        aiEnabled: false,
        isPro: false,
        hasAiCredits: false,
      };
    }

    const chat = params.chatId ? await chatRepository.findById(params.chatId, params.companyId) : null;
    if (params.chatId && !chat) {
      return {
        handler: "offline",
        reason: "chat_not_found",
        businessHoursOpen: false,
        eligibleAgentAvailable: false,
        eligibleAgentIds: [],
        aiEnabled: false,
        isPro: company?.isPro ?? false,
        hasAiCredits: false,
      };
    }

    const isPro = company?.isPro ?? false;
    const aiEnabled = property.aiEnabled !== false && isPro && (chat?.aiEnabled ?? true) !== false;
    const normalizedHours = normalizeBusinessHours(businessHours);
    const businessHoursOpen = isWithinBusinessHours(normalizedHours);
    const eligibleAgentIds = businessHoursOpen
      ? await getEligibleAgentIds(params.propertyId, params.companyId)
      : [];
    const eligibleAgentAvailable = eligibleAgentIds.length > 0;

    if (businessHoursOpen && chat?.agentId) {
      return {
        handler: "agent",
        reason: "chat_assigned_to_agent",
        businessHoursOpen,
        eligibleAgentAvailable,
        eligibleAgentIds,
        aiEnabled,
        isPro,
        hasAiCredits: false,
      };
    }

    if (eligibleAgentAvailable) {
      return {
        handler: "agent",
        reason: "agent_available",
        businessHoursOpen,
        eligibleAgentAvailable,
        eligibleAgentIds,
        aiEnabled,
        isPro,
        hasAiCredits: false,
      };
    }

    const hasAiCredits =
      aiEnabled && params.includeAiCredits !== false
        ? await aiCreditsService.hasAvailableCredits(params.companyId)
        : aiEnabled;

    if (aiEnabled && hasAiCredits) {
      return {
        handler: "ai",
        reason: businessHoursOpen ? "no_eligible_agent" : "outside_business_hours",
        businessHoursOpen,
        eligibleAgentAvailable,
        eligibleAgentIds,
        aiEnabled,
        isPro,
        hasAiCredits,
      };
    }

    return {
      handler: "offline",
      reason: !isPro ? "not_pro_plan" : !aiEnabled ? "ai_disabled" : "no_ai_credits",
      businessHoursOpen,
      eligibleAgentAvailable,
      eligibleAgentIds,
      aiEnabled,
      isPro,
      hasAiCredits,
    };
  },
};
