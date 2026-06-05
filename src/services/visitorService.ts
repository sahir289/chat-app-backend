import { AppError } from "../utils/appError";
import { visitorRepository } from "../repositories/visitorRepository";
import { visitorEventRepository } from "../repositories/visitorEventRepository";
import { chatRepository } from "../repositories/chatRepository";
import { propertyRepository } from "../repositories/propertyRepository";
import { getAgentPropertyFilter } from "../utils/agentPropertyFilter";
import prisma from "../lib/prisma";
import type {
  Prisma,
  Visitor as PrismaVisitor,
  VisitorEvent,
} from "@prisma/client";

export type VisitorInfo = {
  url: string | null;
  referrer: string | null;
  userAgent: string | null;
  device: string | null;
  browser: string | null;
  country: string | null;
  ipAddress: string | null;
  firstSeen: Date | string;
  lastSeen: Date | string;
};

export type VisitorWithDetails = {
  sessionId: string;
  visitorInfo: VisitorInfo | null;
  pagesViewed: string[];
  chats: Array<{
    id: string;
    status: string;
    createdAt: Date | string;
  }>;
};

export type VisitorDetails = {
  sessionId: string;
  visitorInfo: VisitorInfo | null;
  pagesViewed: string[];
  events: Array<{
    id: string;
    eventType: string;
    url: string | null;
    createdAt: Date | string;
  }>;
  chats: Array<{
    id: string;
    status: string;
    createdAt: Date | string;
  }>;
};

export type ListVisitorsParams = {
  companyId: string;
  userId?: string | null;
  propertyId?: string | null;
  page: number;
  limit: number;
};

export type ListVisitorsResult = {
  data: VisitorWithDetails[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

async function getAllowedPropertyIdsForSession(
  companyId: string,
  userId?: string | null
): Promise<string[] | null> {
  if (!userId) {
    return null;
  }

  const propertyFilter = await getAgentPropertyFilter(userId);
  if (!propertyFilter.isFiltered || propertyFilter.propertyIds === null) {
    return null;
  }

  if (propertyFilter.propertyIds.length === 0) {
    throw new AppError(403, "Access denied");
  }

  return propertyFilter.propertyIds;
}

function filterEventsByPropertyScope(
  events: VisitorEvent[],
  propertyId?: string | null,
  allowedPropertyIds?: string[] | null
): VisitorEvent[] {
  const allowedProperties = allowedPropertyIds ? new Set(allowedPropertyIds) : null;

  return events.filter((event) => {
    if (propertyId && event.propertyId !== propertyId) {
      return false;
    }

    if (allowedProperties && !allowedProperties.has(event.propertyId)) {
      return false;
    }

    return true;
  });
}

function pickLatestEventValue(
  events: VisitorEvent[],
  selector: (event: VisitorEvent) => string | null | undefined
): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const value = selector(events[index]);
    if (value) {
      return value;
    }
  }

  return null;
}

function buildVisitorInfoFromSources(
  visitor: PrismaVisitor | null,
  events: VisitorEvent[]
): VisitorInfo | null {
  const firstEvent = events[0] ?? null;
  const lastEvent = events.at(-1) ?? null;

  if (!visitor && !firstEvent) {
    return null;
  }

  const firstSeen = visitor?.firstSeen ?? firstEvent?.createdAt ?? null;
  const lastSeen =
    lastEvent?.createdAt ?? visitor?.lastSeen ?? visitor?.firstSeen ?? firstSeen;

  if (!firstSeen || !lastSeen) {
    return null;
  }

  return {
    url: pickLatestEventValue(events, (event) => event.url) ?? null,
    referrer: pickLatestEventValue(events, (event) => event.referrer) ?? null,
    userAgent:
      pickLatestEventValue(events, (event) => event.userAgent) ??
      visitor?.userAgent ??
      null,
    device:
      pickLatestEventValue(events, (event) => event.device) ??
      visitor?.device ??
      null,
    browser:
      pickLatestEventValue(events, (event) => event.browser) ??
      visitor?.browser ??
      null,
    country:
      pickLatestEventValue(events, (event) => event.country) ??
      visitor?.country ??
      null,
    ipAddress:
      pickLatestEventValue(events, (event) => event.ipAddress) ??
      visitor?.ipAddress ??
      null,
    firstSeen,
    lastSeen,
  };
}

export const visitorService = {
  /**
   * Get visitor details by session ID
   */
  async getVisitorBySession(
    sessionId: string,
    companyId: string,
    userId?: string | null
  ): Promise<VisitorDetails> {
    if (!sessionId) {
      throw new AppError(400, "sessionId is required");
    }

    const [visitor, events, chats, allowedPropertyIds] = await Promise.all([
      visitorRepository.findBySessionId(sessionId, companyId),
      visitorEventRepository.listBySession(sessionId, companyId),
      chatRepository.findBySessionId(sessionId, companyId),
      getAllowedPropertyIdsForSession(companyId, userId),
    ]);

    const allowedProperties = allowedPropertyIds ? new Set(allowedPropertyIds) : null;
    const scopedChats = allowedProperties
      ? chats.filter((chat) => allowedProperties.has(chat.propertyId))
      : chats;
    const scopedEvents = allowedProperties
      ? events.filter((event) => allowedProperties.has(event.propertyId))
      : events;

    if (allowedProperties && scopedChats.length === 0 && scopedEvents.length === 0) {
      throw new AppError(403, "Access denied to this visitor");
    }

    const visitorInfo = buildVisitorInfoFromSources(visitor, scopedEvents);

    const pagesViewed = scopedEvents
      .filter((e) => e.eventType === "page_view" && e.url)
      .map((e) => e.url!)
      .filter((url, index, self) => self.indexOf(url) === index);

    return {
      sessionId,
      visitorInfo,
      pagesViewed,
      events: scopedEvents.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        url: e.url,
        createdAt: e.createdAt,
      })),
      chats: scopedChats.map((c) => ({
        id: c.id,
        status: c.status,
        createdAt: c.createdAt,
      })),
    };
  },

  /**
   * Update visitor information
   */
  async updateVisitor(
    sessionId: string,
    companyId: string,
    userId: string | null | undefined,
    updates: {
      device?: string;
      browser?: string;
      country?: string;
      userAgent?: string;
    }
  ) {
    if (!sessionId) {
      throw new AppError(400, "sessionId is required");
    }

    const allowedPropertyIds = await getAllowedPropertyIdsForSession(companyId, userId);
    if (allowedPropertyIds) {
      const chats = await chatRepository.findBySessionId(sessionId, companyId);
      const allowedProperties = new Set(allowedPropertyIds);
      const hasAccess = chats.some((chat) => allowedProperties.has(chat.propertyId));
      if (!hasAccess) {
        throw new AppError(403, "Access denied to this visitor");
      }
    }

    const visitor = await visitorRepository.findBySessionId(sessionId, companyId);
    if (!visitor) {
      throw new AppError(404, "Visitor not found");
    }

    const updated = await prisma.visitor.update({
      where: { id: visitor.id },
      data: {
        ...(updates.device !== undefined && { device: updates.device }),
        ...(updates.browser !== undefined && { browser: updates.browser }),
        ...(updates.country !== undefined && { country: updates.country }),
        ...(updates.userAgent !== undefined && { userAgent: updates.userAgent }),
        lastSeen: new Date(),
      },
    });

    return updated;
  },

  /**
   * Create a visitor event
   */
  async createVisitorEvent(params: {
    propertyId: string;
    sessionId: string;
    eventType: string;
    url?: string | null;
    referrer?: string | null;
    userAgent?: string | null;
    device?: string | null;
    browser?: string | null;
    country?: string | null;
    ipAddress?: string | null;
  }) {
    const { propertyId, sessionId, eventType } = params;

    if (!propertyId || !sessionId || !eventType) {
      throw new AppError(
        400,
        "propertyId, sessionId, and eventType are required"
      );
    }

    // Find property by widgetKey or propertyId
    let property = await propertyRepository.findByWidgetKey(propertyId);
    if (!property) {
      const foundProperty = await prisma.property.findFirst({
        where: {
          id: propertyId,
          deletedAt: null,
        },
      });
      if (!foundProperty) {
        throw new AppError(404, "Property not found");
      }
      property = foundProperty;
    }

    const companyId = property.companyId;

    // Create or update visitor to update lastSeen
    const visitor = await visitorRepository.createOrUpdate({
      companyId,
      sessionId,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      device: params.device ?? null,
      browser: params.browser ?? null,
      country: params.country ?? null,
    });

    // Find associated chat if exists
    const chat = await chatRepository.findLatestByPropertyAndSession({
      propertyId: property.id,
      sessionId,
    });

    // Create the event
    const event = await visitorEventRepository.create({
      companyId,
      propertyId: property.id,
      chatId: chat?.id,
      visitorId: visitor.id,
      sessionId,
      eventType,
      url: params.url || null,
      referrer: params.referrer || null,
      userAgent: params.userAgent || null,
      device: params.device || null,
      browser: params.browser || null,
      country: params.country || null,
      ipAddress: params.ipAddress || null,
    });

    return event;
  },

  /**
   * List visitors with pagination and filtering
   * Supports filtering by propertyId through chats relationship
   */
  async listVisitors(params: ListVisitorsParams): Promise<ListVisitorsResult> {
    const { companyId, userId, propertyId, page, limit } = params;

    // Validate pagination parameters (defensive check)
    if (limit < 1 || limit > 100) {
      throw new AppError(400, "Limit must be between 1 and 100");
    }

    const skip = (page - 1) * limit;

    // Get agent property filter
    const propertyFilter = userId
      ? await getAgentPropertyFilter(userId)
      : { propertyIds: null, isFiltered: false };

    // Build where clause
    const where: Prisma.VisitorWhereInput = {
      companyId,
      deletedAt: null,
    };

    // Apply property filter for agents
    if (propertyFilter.isFiltered && propertyFilter.propertyIds !== null) {
      if (propertyFilter.propertyIds.length === 0) {
        // Agent has no properties assigned, return empty
        return {
          data: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
          },
        };
      }

      if (propertyId) {
        // If specific property requested, check if agent has access
        if (!propertyFilter.propertyIds.includes(propertyId)) {
          throw new AppError(403, "Access denied to this property");
        }
        // Filter visitors that have chats with this property
        where.chats = {
          some: {
            propertyId: propertyId,
            deletedAt: null,
          },
        };
      } else {
        // Filter to only visitors with chats in assigned properties
        where.chats = {
          some: {
            propertyId: { in: propertyFilter.propertyIds },
            deletedAt: null,
          },
        };
      }
    } else if (propertyId) {
      // Filter visitors that have chats with this property
      where.chats = {
        some: {
          propertyId: propertyId,
          deletedAt: null,
        },
      };
    }

    // Get visitors with pagination
    const [visitors, total] = await Promise.all([
      visitorRepository.findManyWithFilters(where, skip, limit),
      visitorRepository.countWithFilters(where),
    ]);

    // Batch fetch all visitor events in a single query (fixes N+1 problem)
    const sessionIds = visitors.map((v) => v.sessionId);
    const eventsBySession = await visitorEventRepository.listBySessions(
      sessionIds,
      companyId
    );

    // Process visitors with their events
    const visitorsWithInfo = visitors.map((visitor) => {
      const allEvents = eventsBySession[visitor.sessionId] || [];
      const events = filterEventsByPropertyScope(
        allEvents,
        propertyId,
        propertyFilter.isFiltered ? propertyFilter.propertyIds : null
      );
      const visitorInfo = buildVisitorInfoFromSources(visitor, events);

      const pagesViewed = events
        .filter((e) => e.eventType === "page_view" && e.url)
        .map((e) => e.url!)
        .filter((url, index, self) => self.indexOf(url) === index);

      // Filter chats by propertyId if specified
      let filteredChats = visitor.chats;
      if (propertyId) {
        filteredChats = visitor.chats.filter(
          (c) => c.propertyId === propertyId
        );
      }

      return {
        sessionId: visitor.sessionId,
        visitorInfo,
        pagesViewed,
        chats: filteredChats.map((c) => ({
          id: c.id,
          status: c.status,
          createdAt: c.createdAt,
        })),
      };
    });

    return {
      data: visitorsWithInfo,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },
};

