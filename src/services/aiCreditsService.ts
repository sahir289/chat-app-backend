import { Prisma } from "@prisma/client";
import type { AiStatus, Message } from "@prisma/client";
import prisma from "../lib/prisma";
import { emitAiCreditsUpdated } from "../socket/emitAiCreditsUpdate";
import { AppError } from "../utils/appError";
import { buildActiveAnniversaryBillingPeriod } from "../utils/billingPeriod";

const AI_CREDITS_RESET_POLL_MS = 60 * 60 * 1000;
export const DEFAULT_PRO_MONTHLY_CREDITS = 150;
export const DEFAULT_PRO_TOKENS_PER_CREDIT = 1000;

type CompanyCreditState = {
    id: string;
    aiCreditsMonthlyBase: number;
    aiCreditsMonthlyManualOverride: boolean;
    aiCreditsUsed: number;
    aiCreditsRemaining: number;
    aiCreditsResetAt: Date;
    aiStatus: AiStatus;
    aiTokensPerCredit: number;
    aiTokensPerCreditManualOverride: boolean;
    aiPromptTokensUsed: number;
    aiCompletionTokensUsed: number;
    aiTotalTokensUsed: number;
    aiMonthlyPromptTokensUsed: number;
    aiMonthlyCompletionTokensUsed: number;
    aiMonthlyTokensUsed: number;
};

export type AiUsageSummary = {
    monthlyCreditsAssigned: number;
    monthlyCreditsUsed: number;
    monthlyCreditsRemaining: number;
    topupCreditsAssigned: number;
    topupCreditsUsed: number;
    topupCreditsRemaining: number;
    totalCreditsAssigned: number;
    creditsUsed: number;
    creditsRemaining: number;
    tokensPerCredit: number;
    tokenLimit: number;
    tokensUsed: number;
    tokensRemaining: number;
    promptTokensUsed: number;
    completionTokensUsed: number;
    totalTokensUsed: number;
    resetDate: Date;
    status: "active" | "limit_reached";
};

/** Company dashboard: credits only — token breakdown is super-admin only. */
export type AiUsageSummaryPublic = Omit<
    AiUsageSummary,
    | "tokenLimit"
    | "tokensUsed"
    | "tokensRemaining"
>;

export function toPublicAiUsageSummary(usage: AiUsageSummary): AiUsageSummaryPublic {
    const { tokenLimit: _tl, tokensUsed: _tu, tokensRemaining: _tr, ...rest } = usage;
    return rest;
}

type UpdateCompanyAiCreditsInput = {
    monthlyCredits?: number;
    tokensPerCredit?: number;
    resetTopup?: boolean;
};

type CreateAiTopupInput = {
    creditsAdded: number;
    amount: number;
};

type RecordUsageInput = {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
};

type DailyUsageHistoryRow = {
    usedAt: Date;
    usageCount: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    creditsConsumed: number;
    topupCreditsConsumed: number;
    creditsConsumedMilli: number;
    topupCreditsConsumedMilli: number;
};

let aiCreditsResetTimer: NodeJS.Timeout | null = null;
let aiCreditsResetWorkerRunning = false;

function addOneMonth(date: Date): Date {
    const nextResetAt = new Date(date);
    nextResetAt.setMonth(nextResetAt.getMonth() + 1);
    return nextResetAt;
}

function rollResetAtForward(resetAt: Date, now: Date): Date {
    let nextResetAt = new Date(resetAt);

    if (Number.isNaN(nextResetAt.getTime())) {
        nextResetAt = new Date(now);
    }

    while (nextResetAt <= now) {
        const candidate = addOneMonth(nextResetAt);
        if (candidate.getTime() === nextResetAt.getTime()) {
            candidate.setDate(candidate.getDate() + 31);
        }
        nextResetAt = candidate;
    }

    return nextResetAt;
}

function toDbAiStatus(status: "active" | "limit_reached"): AiStatus {
    return status === "limit_reached" ? "LIMIT_REACHED" : "ACTIVE";
}

function sanitizeTokensPerCredit(value: number): number {
    const parsed = Math.floor(value);
    return parsed > 0 ? parsed : 500;
}

function isSameInstant(left: Date, right: Date): boolean {
    return left.getTime() === right.getTime();
}

function ceilDiv(value: number, divisor: number): number {
    return Math.ceil(value / divisor);
}

function creditsMilliFromTokens(tokens: number, tokensPerCredit: number): number {
    const tpc = sanitizeTokensPerCredit(tokensPerCredit);
    const normalized = Math.max(Math.floor(tokens || 0), 0);
    if (normalized <= 0) {
        return 0;
    }
    return Math.max(1, Math.round((normalized / tpc) * 1000));
}

/** Persisted on Company.aiCreditsRemaining: millicredits (3 decimal places) for sync comparisons. */
function creditsRemainingMilliFromTokens(tokensRemaining: number, tokensPerCredit: number): number {
    const tpc = sanitizeTokensPerCredit(tokensPerCredit);
    if (tokensRemaining <= 0) {
        return 0;
    }
    return Math.round((tokensRemaining / tpc) * 1000);
}

function roundCreditsDisplay(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.round(value * 10000) / 10000;
}

/** Consume top-up credits in FIFO order so row balances remain the source of truth across resets. */
async function consumeTopupCreditsTx(
    tx: Prisma.TransactionClient,
    companyId: string,
    creditsToConsumeMilli: number
): Promise<void> {
    let remainingToConsume = Math.max(Math.floor(creditsToConsumeMilli), 0);

    if (remainingToConsume <= 0) {
        return;
    }

    const topups = await tx.aiTopup.findMany({
        where: {
            companyId,
            OR: [{ creditsRemainingMilli: { gt: 0 } }, { creditsRemaining: { gt: 0 } }],
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, creditsRemaining: true, creditsRemainingMilli: true },
    });

    for (const row of topups) {
        if (remainingToConsume <= 0) {
            break;
        }

        const rowRemainingMilli =
            row.creditsRemainingMilli > 0 ? row.creditsRemainingMilli : Math.max(row.creditsRemaining, 0) * 1000;
        const consume = Math.min(Math.max(rowRemainingMilli, 0), remainingToConsume);
        remainingToConsume -= consume;

        await tx.aiTopup.update({
            where: { id: row.id },
            data: {
                creditsRemainingMilli: rowRemainingMilli - consume,
                // Keep legacy int column best-effort in sync for old UIs/admin screens.
                creditsRemaining: Math.ceil(Math.max(rowRemainingMilli - consume, 0) / 1000),
            },
        });
    }

    if (remainingToConsume > 0) {
        throw new AppError(400, "Not enough top-up credits remaining");
    }
}

async function getTopupAggregateTx(
    tx: Prisma.TransactionClient,
    companyId: string
): Promise<{ assignedMilli: number; remainingMilli: number }> {
    const aggregate = await tx.aiTopup.aggregate({
        where: { companyId },
        _sum: {
            creditsAdded: true,
            creditsRemaining: true,
            creditsAddedMilli: true,
            creditsRemainingMilli: true,
        },
    });

    const assignedMilliRaw = Math.max(aggregate._sum.creditsAddedMilli ?? 0, 0);
    const remainingMilliRaw = Math.max(aggregate._sum.creditsRemainingMilli ?? 0, 0);

    // Backward compatibility: old rows might still have only int credits populated.
    const assignedFallback = Math.max(aggregate._sum.creditsAdded ?? 0, 0) * 1000;
    const remainingFallback = Math.max(aggregate._sum.creditsRemaining ?? 0, 0) * 1000;

    return {
        assignedMilli: assignedMilliRaw > 0 ? assignedMilliRaw : assignedFallback,
        remainingMilli: remainingMilliRaw > 0 ? remainingMilliRaw : remainingFallback,
    };
}

async function getCompanyCreditStateTx(
    tx: Prisma.TransactionClient,
    companyId: string
): Promise<CompanyCreditState> {
    const company = await tx.company.findUnique({
        where: { id: companyId },
        select: {
            id: true,
            aiCreditsMonthlyBase: true,
            aiCreditsMonthlyManualOverride: true,
            aiCreditsUsed: true,
            aiCreditsRemaining: true,
            aiCreditsResetAt: true,
            aiStatus: true,
            aiTokensPerCredit: true,
            aiTokensPerCreditManualOverride: true,
            aiPromptTokensUsed: true,
            aiCompletionTokensUsed: true,
            aiTotalTokensUsed: true,
            aiMonthlyPromptTokensUsed: true,
            aiMonthlyCompletionTokensUsed: true,
            aiMonthlyTokensUsed: true,
        },
    });

    if (!company) {
        throw new AppError(404, "Company not found");
    }

    return company;
}

function buildUsageSummary(
    company: CompanyCreditState,
    topup: { assignedMilli: number; remainingMilli: number }
): AiUsageSummary {
    const tokensPerCredit = sanitizeTokensPerCredit(company.aiTokensPerCredit);
    const monthlyAssigned = Math.max(company.aiCreditsMonthlyBase, 0);
    const topupAssigned = Math.max(topup.assignedMilli, 0) / 1000;
    const topupRemaining = Math.min(Math.max(topup.remainingMilli, 0), Math.round(topupAssigned * 1000)) / 1000;
    const totalCreditsAssigned = monthlyAssigned + topupAssigned;

    const monthlyTokenBudget = monthlyAssigned * tokensPerCredit;
    const topupTokenBudgetRemaining = Math.round(topupRemaining * tokensPerCredit);
    const tokenLimit = Math.max(monthlyTokenBudget + topupTokenBudgetRemaining, 0);

    const tokensUsed = Math.max(company.aiMonthlyTokensUsed, 0);
    const tokensFromMonthly = Math.min(tokensUsed, monthlyTokenBudget);
    const monthlyTokensRemaining = Math.max(0, monthlyTokenBudget - tokensFromMonthly);
    const tokensRemaining = monthlyTokensRemaining + topupTokenBudgetRemaining;

    const monthlyCreditsUsed = roundCreditsDisplay(monthlyTokenBudget > 0 ? tokensFromMonthly / tokensPerCredit : 0);
    const topupTokensUsed = Math.max(0, tokensUsed - tokensFromMonthly);
    const topupCreditsUsed = roundCreditsDisplay(topupTokensUsed / tokensPerCredit);
    const monthlyCreditsRemaining = roundCreditsDisplay(
        monthlyTokenBudget > 0 ? monthlyTokensRemaining / tokensPerCredit : 0
    );
    const topupCreditsRemaining = roundCreditsDisplay(topupRemaining);

    const creditsUsed = roundCreditsDisplay(monthlyCreditsUsed + topupCreditsUsed);
    const creditsRemaining = roundCreditsDisplay(monthlyCreditsRemaining + topupCreditsRemaining);

    const status: "active" | "limit_reached" = tokensRemaining > 0 ? "active" : "limit_reached";

    return {
        monthlyCreditsAssigned: monthlyAssigned,
        monthlyCreditsUsed,
        monthlyCreditsRemaining,
        topupCreditsAssigned: topupAssigned,
        topupCreditsUsed,
        topupCreditsRemaining,
        totalCreditsAssigned,
        creditsUsed,
        creditsRemaining,
        tokensPerCredit,
        tokenLimit,
        tokensUsed,
        tokensRemaining,
        promptTokensUsed: Math.max(company.aiMonthlyPromptTokensUsed, 0),
        completionTokensUsed: Math.max(company.aiMonthlyCompletionTokensUsed, 0),
        totalTokensUsed: Math.max(company.aiMonthlyTokensUsed, 0),
        resetDate: company.aiCreditsResetAt,
        status,
    };
}

async function syncMonthlyResetTx(
    tx: Prisma.TransactionClient,
    companyId: string
): Promise<{ company: CompanyCreditState; topup: { assignedMilli: number; remainingMilli: number } }> {
    let company = await ensureCompanyAiCreditConfigTx(tx, companyId);
    const now = new Date();

    if (company.aiCreditsResetAt <= now) {
        const nextResetAt = rollResetAtForward(company.aiCreditsResetAt, now);
        company = await tx.company.update({
            where: { id: companyId },
            data: {
                aiCreditsUsed: 0,
                aiMonthlyPromptTokensUsed: 0,
                aiMonthlyCompletionTokensUsed: 0,
                aiMonthlyTokensUsed: 0,
                aiCreditsResetAt: nextResetAt,
            },
            select: {
                id: true,
                aiCreditsMonthlyBase: true,
                aiCreditsMonthlyManualOverride: true,
                aiCreditsUsed: true,
                aiCreditsRemaining: true,
                aiCreditsResetAt: true,
                aiStatus: true,
                aiTokensPerCredit: true,
                aiTokensPerCreditManualOverride: true,
                aiPromptTokensUsed: true,
                aiCompletionTokensUsed: true,
                aiTotalTokensUsed: true,
                aiMonthlyPromptTokensUsed: true,
                aiMonthlyCompletionTokensUsed: true,
                aiMonthlyTokensUsed: true,
            },
        });
    }

    const topup = await getTopupAggregateTx(tx, companyId);
    const usage = buildUsageSummary(company, topup);
    const targetStatus = toDbAiStatus(usage.status);
    const remainingMilli = creditsRemainingMilliFromTokens(usage.tokensRemaining, usage.tokensPerCredit);
    if (company.aiStatus !== targetStatus || company.aiCreditsRemaining !== remainingMilli) {
        company = await tx.company.update({
            where: { id: companyId },
            data: {
                aiStatus: targetStatus,
                aiCreditsRemaining: remainingMilli,
            },
            select: {
                id: true,
                aiCreditsMonthlyBase: true,
                aiCreditsMonthlyManualOverride: true,
                aiCreditsUsed: true,
                aiCreditsRemaining: true,
                aiCreditsResetAt: true,
                aiStatus: true,
                aiTokensPerCredit: true,
                aiTokensPerCreditManualOverride: true,
                aiPromptTokensUsed: true,
                aiCompletionTokensUsed: true,
                aiTotalTokensUsed: true,
                aiMonthlyPromptTokensUsed: true,
                aiMonthlyCompletionTokensUsed: true,
                aiMonthlyTokensUsed: true,
            },
        });
    }

    return { company, topup };
}

async function ensureCompanyAiCreditConfigTx(
    tx: Prisma.TransactionClient,
    companyId: string
): Promise<CompanyCreditState> {
    let company = await getCompanyCreditStateTx(tx, companyId);

    const companyPlan = await tx.company.findUnique({
        where: { id: companyId },
        select: { isPro: true },
    });

    if (!companyPlan) {
        throw new AppError(404, "Company not found");
    }

    if (!companyPlan.isPro) {
        return company;
    }

    const subscription = await tx.subscription.findFirst({
        where: {
            companyId,
            planTier: "PRO",
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
            subscriptionStartDate: true,
            billingAnchorDay: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            nextBillingAt: true,
            createdAt: true,
        },
    });

    if (!subscription) {
        return company;
    }

    const period = buildActiveAnniversaryBillingPeriod({
        subscriptionStartDate:
            subscription.subscriptionStartDate ?? subscription.currentPeriodStart ?? subscription.createdAt,
        billingAnchorDay: subscription.billingAnchorDay,
        currentPeriodStart: subscription.currentPeriodStart,
        nextBillingAt: subscription.nextBillingAt,
    });

    const nextResetAt = subscription.nextBillingAt ?? subscription.currentPeriodEnd ?? period.nextBillingAt;
    const nextMonthlyBase = company.aiCreditsMonthlyManualOverride
        ? Math.max(company.aiCreditsMonthlyBase, 0)
        : DEFAULT_PRO_MONTHLY_CREDITS;
    const nextTokensPerCredit = company.aiTokensPerCreditManualOverride
        ? sanitizeTokensPerCredit(company.aiTokensPerCredit)
        : DEFAULT_PRO_TOKENS_PER_CREDIT;

    const needsUpdate =
        company.aiCreditsMonthlyBase !== nextMonthlyBase ||
        company.aiTokensPerCredit !== nextTokensPerCredit ||
        !isSameInstant(company.aiCreditsResetAt, nextResetAt);

    if (!needsUpdate) {
        return company;
    }

    company = await tx.company.update({
        where: { id: companyId },
        data: {
            aiCreditsMonthlyBase: nextMonthlyBase,
            aiCreditsMonthlyManualOverride: company.aiCreditsMonthlyManualOverride,
            aiTokensPerCredit: nextTokensPerCredit,
            aiTokensPerCreditManualOverride: company.aiTokensPerCreditManualOverride,
            aiCreditsResetAt: nextResetAt,
        },
        select: {
            id: true,
            aiCreditsMonthlyBase: true,
            aiCreditsMonthlyManualOverride: true,
            aiCreditsUsed: true,
            aiCreditsRemaining: true,
            aiCreditsResetAt: true,
            aiStatus: true,
            aiTokensPerCredit: true,
            aiTokensPerCreditManualOverride: true,
            aiPromptTokensUsed: true,
            aiCompletionTokensUsed: true,
            aiTotalTokensUsed: true,
            aiMonthlyPromptTokensUsed: true,
            aiMonthlyCompletionTokensUsed: true,
            aiMonthlyTokensUsed: true,
        },
    });

    return company;
}

async function listUsageHistoryTx(
    tx: Prisma.TransactionClient,
    companyId: string,
    page: number,
    limit: number,
    startDate?: Date,
    endDate?: Date
) {
    const whereClause: Prisma.AiTokenUsageWhereInput = {
        companyId,
        ...(startDate || endDate
            ? {
                  createdAt: {
                      ...(startDate ? { gte: startDate } : {}),
                      ...(endDate ? { lte: endDate } : {}),
                  },
              }
            : {}),
    };
    const sqlConditions: Prisma.Sql[] = [Prisma.sql`"companyId" = ${companyId}`];
    if (startDate) {
        sqlConditions.push(Prisma.sql`"createdAt" >= ${startDate}`);
    }
    if (endDate) {
        sqlConditions.push(Prisma.sql`"createdAt" <= ${endDate}`);
    }
    const whereSql = Prisma.sql`WHERE ${Prisma.join(sqlConditions, " AND ")}`;

    const safePage = Math.max(1, Math.floor(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Math.floor(limit) || 10));

    const [groupedCountRows, aggregate] = await Promise.all([
        tx.$queryRaw<Array<{ total: number }>>(Prisma.sql`
            SELECT COUNT(*)::int AS "total"
            FROM (
                SELECT DATE_TRUNC('day', "createdAt") AS "usedAt"
                FROM "AiTokenUsage"
                ${whereSql}
                GROUP BY DATE_TRUNC('day', "createdAt")
            ) AS "daily_usage"
        `),
        tx.aiTokenUsage.aggregate({
            where: whereClause,
            _sum: {
                promptTokens: true,
                completionTokens: true,
                totalTokens: true,
                creditsConsumed: true,
                creditsConsumedMilli: true,
            },
        }),
    ]);
    const total = groupedCountRows[0]?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));
    const actualPage = Math.min(safePage, totalPages);
    const actualSkip = (actualPage - 1) * safeLimit;
    const items = await tx.$queryRaw<DailyUsageHistoryRow[]>(Prisma.sql`
        SELECT
            DATE_TRUNC('day', "createdAt") AS "usedAt",
            COUNT(*)::int AS "usageCount",
            COALESCE(SUM("promptTokens"), 0)::int AS "promptTokens",
            COALESCE(SUM("completionTokens"), 0)::int AS "completionTokens",
            COALESCE(SUM("totalTokens"), 0)::int AS "totalTokens",
            COALESCE(SUM("creditsConsumed"), 0)::int AS "creditsConsumed",
            COALESCE(SUM("topupCreditsConsumed"), 0)::int AS "topupCreditsConsumed",
            COALESCE(SUM("creditsConsumedMilli"), 0)::int AS "creditsConsumedMilli",
            COALESCE(SUM("topupCreditsConsumedMilli"), 0)::int AS "topupCreditsConsumedMilli"
        FROM "AiTokenUsage"
        ${whereSql}
        GROUP BY DATE_TRUNC('day', "createdAt")
        ORDER BY "usedAt" DESC
        OFFSET ${actualSkip}
        LIMIT ${safeLimit}
    `);

    return {
        items: items.map((item) => ({
            ...item,
            usedAt: new Date(item.usedAt),
        })),
        totals: {
            promptTokensUsed: aggregate._sum.promptTokens ?? 0,
            completionTokensUsed: aggregate._sum.completionTokens ?? 0,
            totalTokensUsed: aggregate._sum.totalTokens ?? 0,
            creditsConsumed: aggregate._sum.creditsConsumed ?? 0,
            creditsConsumedMilli: aggregate._sum.creditsConsumedMilli ?? 0,
        },
        pagination: {
            page: actualPage,
            limit: safeLimit,
            total,
            totalPages,
        },
    };
}

async function runAiCreditsResetWorker(): Promise<void> {
    if (aiCreditsResetWorkerRunning) {
        return;
    }

    aiCreditsResetWorkerRunning = true;
    try {
        while (true) {
            const dueCompanies = await prisma.company.findMany({
                where: { aiCreditsResetAt: { lte: new Date() } },
                select: { id: true },
                take: 100,
            });
            if (dueCompanies.length === 0) {
                break;
            }

            for (const company of dueCompanies) {
                try {
                    await prisma.$transaction(async (tx) => {
                        await syncMonthlyResetTx(tx, company.id);
                    });
                    emitAiCreditsUpdated(company.id);
                } catch {
                    // best effort
                }
            }
        }
    } finally {
        aiCreditsResetWorkerRunning = false;
    }
}

export const aiCreditsService = {
    
    async getUsage(companyId: string): Promise<AiUsageSummary> {
        return prisma.$transaction(async (tx) => {
            const { company, topup } = await syncMonthlyResetTx(tx, companyId);
            return buildUsageSummary(company, topup);
        });
    },

    async getUsageHistory(companyId: string, page: number = 1, limit: number = 10, startDate?: Date, endDate?: Date) {
        return prisma.$transaction(async (tx) => {
            await syncMonthlyResetTx(tx, companyId);
            return listUsageHistoryTx(tx, companyId, page, limit, startDate, endDate);
        });
    },

    async hasAvailableCredits(companyId: string): Promise<boolean> {
        const usage = await this.getUsage(companyId);
        return usage.tokensRemaining > 0;
    },

    async createTrackedAiBotMessage(params: {
        companyId: string;
        chatId: string;
        text: string;
        botName: string;
        usage: RecordUsageInput;
        replyToClientMessageId?: string | null;
        metadata?: Prisma.InputJsonValue;
    }): Promise<Message | null> {
        const { companyId, chatId, text, botName, usage, replyToClientMessageId, metadata } = params;

        const result = await prisma.$transaction(async (tx) => {
            const normalizedUsage: RecordUsageInput = {
                promptTokens: Math.max(Math.floor(usage.promptTokens || 0), 0),
                completionTokens: Math.max(Math.floor(usage.completionTokens || 0), 0),
                totalTokens: Math.max(Math.floor(usage.totalTokens || 0), 0),
            };
            const { company, topup } = await syncMonthlyResetTx(tx, companyId);
            const currentUsage = buildUsageSummary(company, topup);
            const creditsNeeded = ceilDiv(normalizedUsage.totalTokens, currentUsage.tokensPerCredit);
            const creditsNeededMilli = creditsMilliFromTokens(
                normalizedUsage.totalTokens,
                currentUsage.tokensPerCredit
            );

            if (normalizedUsage.totalTokens > currentUsage.tokensRemaining) {
                const remainingMilli = creditsRemainingMilliFromTokens(
                    currentUsage.tokensRemaining,
                    currentUsage.tokensPerCredit
                );
                await tx.company.update({
                    where: { id: companyId },
                    data: {
                        aiStatus: "LIMIT_REACHED",
                        aiCreditsRemaining: remainingMilli,
                    },
                });
                return null;
            }

            const monthlyTokenBudget = currentUsage.monthlyCreditsAssigned * currentUsage.tokensPerCredit;
            const beforeTokens = currentUsage.tokensUsed;
            const afterTokens = beforeTokens + normalizedUsage.totalTokens;
            const beforeFromMonthly = Math.min(beforeTokens, monthlyTokenBudget);
            const afterFromMonthly = Math.min(afterTokens, monthlyTokenBudget);
            const monthlyTokenDelta = afterFromMonthly - beforeFromMonthly;
            const topupTokenDelta = Math.max(0, normalizedUsage.totalTokens - monthlyTokenDelta);
            const monthlyCreditsConsumed = ceilDiv(monthlyTokenDelta, currentUsage.tokensPerCredit);
            const topupCreditsConsumed = ceilDiv(topupTokenDelta, currentUsage.tokensPerCredit);
            const monthlyCreditsConsumedMilli = creditsMilliFromTokens(
                monthlyTokenDelta,
                currentUsage.tokensPerCredit
            );
            const topupCreditsConsumedMilli = creditsMilliFromTokens(
                topupTokenDelta,
                currentUsage.tokensPerCredit
            );

            const newCreditsUsed = Math.min(
                ceilDiv(afterTokens, currentUsage.tokensPerCredit),
                currentUsage.totalCreditsAssigned
            );

            const updatedCompany = await tx.company.update({
                where: { id: companyId },
                data: {
                    aiCreditsUsed: newCreditsUsed,
                    aiPromptTokensUsed: {
                        increment: normalizedUsage.promptTokens,
                    },
                    aiCompletionTokensUsed: {
                        increment: normalizedUsage.completionTokens,
                    },
                    aiTotalTokensUsed: {
                        increment: normalizedUsage.totalTokens,
                    },
                    aiMonthlyPromptTokensUsed: {
                        increment: normalizedUsage.promptTokens,
                    },
                    aiMonthlyCompletionTokensUsed: {
                        increment: normalizedUsage.completionTokens,
                    },
                    aiMonthlyTokensUsed: {
                        increment: normalizedUsage.totalTokens,
                    },
                },
                select: {
                    id: true,
                    aiCreditsMonthlyBase: true,
                    aiCreditsMonthlyManualOverride: true,
                    aiCreditsUsed: true,
                    aiCreditsRemaining: true,
                    aiCreditsResetAt: true,
                    aiStatus: true,
                    aiTokensPerCredit: true,
                    aiTokensPerCreditManualOverride: true,
                    aiPromptTokensUsed: true,
                    aiCompletionTokensUsed: true,
                    aiTotalTokensUsed: true,
                    aiMonthlyPromptTokensUsed: true,
                    aiMonthlyCompletionTokensUsed: true,
                    aiMonthlyTokensUsed: true,
                },
            });
            await consumeTopupCreditsTx(tx, companyId, topupCreditsConsumedMilli);

            const updatedTopup = await getTopupAggregateTx(tx, companyId);
            const updatedUsage = buildUsageSummary(updatedCompany, updatedTopup);

            const updatedRemainingMilli = creditsRemainingMilliFromTokens(
                updatedUsage.tokensRemaining,
                updatedUsage.tokensPerCredit
            );

            await tx.company.update({
                where: { id: companyId },
                data: {
                    aiStatus: toDbAiStatus(updatedUsage.status),
                    aiCreditsRemaining: updatedRemainingMilli,
                },
            });

            await tx.aiTokenUsage.create({
                data: {
                    companyId,
                    chatId,
                    promptTokens: normalizedUsage.promptTokens,
                    completionTokens: normalizedUsage.completionTokens,
                    totalTokens: normalizedUsage.totalTokens,
                    creditsConsumed: creditsNeeded,
                    monthlyCreditsConsumed,
                    topupCreditsConsumed,
                    creditsConsumedMilli: creditsNeededMilli,
                    monthlyCreditsConsumedMilli,
                    topupCreditsConsumedMilli,
                },
            });

            return tx.message.create({
                data: {
                    chatId,
                    senderType: "BOT",
                    text,
                    botName,
                    replyToClientMessageId: replyToClientMessageId?.trim() || null,
                    metadata,
                },
            });
        });
        emitAiCreditsUpdated(companyId);
        return result;
    },

    async syncCompanyPlanCredits(companyId: string): Promise<AiUsageSummary> {
        const usage = await prisma.$transaction(async (tx) => {
            const company = await ensureCompanyAiCreditConfigTx(tx, companyId);
            const topup = await getTopupAggregateTx(tx, companyId);
            const usage = buildUsageSummary(company, topup);
            const remainingMilli = creditsRemainingMilliFromTokens(usage.tokensRemaining, usage.tokensPerCredit);

            if (company.aiStatus !== toDbAiStatus(usage.status) || company.aiCreditsRemaining !== remainingMilli) {
                await tx.company.update({
                    where: { id: companyId },
                    data: {
                        aiStatus: toDbAiStatus(usage.status),
                        aiCreditsRemaining: remainingMilli,
                    },
                });
            }

            return usage;
        });
        emitAiCreditsUpdated(companyId);
        return usage;
    },

    async updateCompanyCredits(companyId: string, input: UpdateCompanyAiCreditsInput): Promise<AiUsageSummary> {
        const usage = await prisma.$transaction(async (tx) => {
            await ensureCompanyAiCreditConfigTx(tx, companyId);

            if (input.monthlyCredits !== undefined || input.tokensPerCredit !== undefined) {
                await tx.company.update({
                    where: { id: companyId },
                    data: {
                        ...(input.monthlyCredits !== undefined
                            ? {
                                  aiCreditsMonthlyBase: Math.max(Math.floor(input.monthlyCredits), 0),
                                  aiCreditsMonthlyManualOverride: true,
                              }
                            : {}),
                        ...(input.tokensPerCredit !== undefined
                            ? {
                                  aiTokensPerCredit: sanitizeTokensPerCredit(input.tokensPerCredit),
                                  aiTokensPerCreditManualOverride: true,
                              }
                            : {}),
                    },
                });
            }

            if (input.resetTopup) {
                await tx.aiTopup.updateMany({
                    where: {
                        companyId,
                        OR: [{ creditsRemaining: { gt: 0 } }, { creditsRemainingMilli: { gt: 0 } }],
                    },
                    data: {
                        creditsRemaining: 0,
                        creditsRemainingMilli: 0,
                    },
                });
            }

            const company = await getCompanyCreditStateTx(tx, companyId);
            const topupFresh = await getTopupAggregateTx(tx, companyId);
            const usage = buildUsageSummary(company, topupFresh);
            const remainingMilli = creditsRemainingMilliFromTokens(usage.tokensRemaining, usage.tokensPerCredit);

            await tx.company.update({
                where: { id: companyId },
                data: {
                    aiStatus: toDbAiStatus(usage.status),
                    aiCreditsRemaining: remainingMilli,
                },
            });

            return usage;
        });
        emitAiCreditsUpdated(companyId);
        return usage;
    },

    async createTopup(companyId: string, input: CreateAiTopupInput): Promise<{
        topup: {
            id: string;
            companyId: string;
            creditsAdded: number;
            creditsRemaining: number;
            amount: number;
            createdAt: Date;
        };
        usage: AiUsageSummary;
    }> {
        const out = await prisma.$transaction(async (tx) => {
            const { company } = await syncMonthlyResetTx(tx, companyId);
            const topup = await tx.aiTopup.create({
                data: {
                    companyId,
                    creditsAdded: input.creditsAdded,
                    creditsRemaining: input.creditsAdded,
                    creditsAddedMilli: input.creditsAdded * 1000,
                    creditsRemainingMilli: input.creditsAdded * 1000,
                    amount: input.amount,
                },
                select: {
                    id: true,
                    companyId: true,
                    creditsAdded: true,
                    creditsRemaining: true,
                    creditsAddedMilli: true,
                    creditsRemainingMilli: true,
                    amount: true,
                    createdAt: true,
                },
            });
            const topupAggregate = await getTopupAggregateTx(tx, companyId);
            const usage = buildUsageSummary(company, topupAggregate);
            const remainingMilli = creditsRemainingMilliFromTokens(usage.tokensRemaining, usage.tokensPerCredit);
            await tx.company.update({
                where: { id: companyId },
                data: {
                    aiStatus: toDbAiStatus(usage.status),
                    aiCreditsRemaining: remainingMilli,
                },
            });

            return {
                topup,
                usage,
            };
        });
        emitAiCreditsUpdated(companyId);
        return out;
    },

    async resetDueCredits(): Promise<void> {
        await runAiCreditsResetWorker();
    },

    startResetWorker(): void {
        if (aiCreditsResetTimer) {
            return;
        }

        aiCreditsResetTimer = setInterval(() => {
            void runAiCreditsResetWorker();
        }, AI_CREDITS_RESET_POLL_MS);

        aiCreditsResetTimer.unref?.();
        void runAiCreditsResetWorker();
    },
};
