export type PlatformStats = {
    totalCompanies: number;
    totalUsers: number;
    activeUsers: number;
    proUsers: number;
    freeTrialUsers: number;
    totalLeads: number;
};

export type PlatformStatsFilters = {
    startDate?: Date;
    endDate?: Date;
};