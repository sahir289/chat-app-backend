import { chatRepository } from "../repositories/chatRepository";
import { visitorEventRepository } from "../repositories/visitorEventRepository";
import { leadRepository } from "../repositories/leadRepository";
import { getChatBucketCounts } from "./chatMetricsService";

export interface DashboardOverview {
  totalVisitorsToday: number;
  totalChats: number;
  activeChats: number;
  closedChats: number;
  averageResponseTime: number | null;
  websiteVisitorsInProgress: number;
  totalLeads: number;
}

export const dashboardService = {
  async getOverview(
    companyId: string,
    propertyId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<DashboardOverview> {
    // Use the dates as provided (already normalized in controller)
    // If no dates provided, show all-time data
    const dateStart = startDate;
    const dateEnd = endDate;

    const visitorsPromise =
      dateStart && dateEnd
        ? visitorEventRepository.countByPropertyAndType(
            companyId,
            propertyId,
            "chat_start",
            dateStart,
            dateEnd
          )
        : visitorEventRepository.countByPropertyAndType(companyId, propertyId, "chat_start");

    const totalChatsPromise = chatRepository.countByPropertyAndDateRange(
      companyId,
      propertyId,
      dateStart,
      dateEnd
    );
    const chatBucketsPromise = getChatBucketCounts({
      companyId,
      propertyId,
      startDate: dateStart,
      endDate: dateEnd,
    });

    const closedChatsPromise = chatRepository.countByPropertyAndStatusAndDateRange(
      companyId,
      propertyId,
      "CLOSED",
      dateStart,
      dateEnd
    );

    const averageResponseTimePromise = chatRepository.getAverageResponseTime(
      companyId,
      propertyId,
      dateStart,
      dateEnd
    );

    const totalLeadsPromise = leadRepository.countByPropertyIdAndDateRange(
      propertyId,
      companyId,
      dateStart,
      dateEnd
    );

    const [
      totalVisitorsToday,
      totalChats,
      chatBuckets,
      closedChats,
      averageResponseTime,
      totalLeads,
    ] = await Promise.all([
      visitorsPromise,
      totalChatsPromise,
      chatBucketsPromise,
      closedChatsPromise,
      averageResponseTimePromise,
      totalLeadsPromise,
    ]);
    const activeChats = chatBuckets.activeChats;
    const normalizedClosedChats = chatBuckets.closedChats;
    const websiteVisitorsInProgress = chatBuckets.onlineActiveChats;

    return {
      totalVisitorsToday,
      totalChats,
      activeChats,
      closedChats: Math.max(normalizedClosedChats, closedChats),
      averageResponseTime,
      websiteVisitorsInProgress,
      totalLeads,
    };
  },
};

