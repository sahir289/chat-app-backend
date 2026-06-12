import {
  PlanTier,
  Role,
  SubscriptionStatus,
  type BillingCycle,
  type Subscription as SubscriptionRow,
} from "@prisma/client";
import prisma from "../lib/prisma";
import { AppError } from "../utils/appError";
import { companyRepository } from "../repositories/companyRepository";
import { subscriptionRepository } from "../repositories/subscriptionRepository";
import { aiCreditsService } from "./aiCreditsService";
import { moduleControlService } from "./moduleControlService";
import {
  buildActiveAnniversaryBillingPeriod,
  buildInitialAnniversaryBillingPeriod,
  isFixedDurationBillingCycle,
} from "../utils/billingPeriod";

export type SubscriptionBillingCycle =
  | "TRIAL"
  | "TEST_1_MIN"
  | "MONTHLY"
  | "QUARTERLY"
  | "HALF_YEARLY"
  | "YEARLY";

export const DEFAULT_BILLING_CYCLE: SubscriptionBillingCycle = "MONTHLY";
export const SUBSCRIPTION_BILLING_CYCLES: readonly SubscriptionBillingCycle[] = [
  "TRIAL",
  "TEST_1_MIN",
  "MONTHLY",
  "QUARTERLY",
  "HALF_YEARLY",
  "YEARLY",
];

const PAID_ACCESS_STATUSES = new Set<SubscriptionStatus>([
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
]);

const FREE_PLAN_DOWNGRADE_STATUSES = new Set<SubscriptionStatus>([
  SubscriptionStatus.CANCELED,
  SubscriptionStatus.EXPIRED,
]);

export const subscriptionAccessSelect = {
  planTier: true,
  status: true,
  currentPeriodEnd: true,
  nextBillingAt: true,
} as const;

export type SubscriptionAccessSubscription = Pick<
  SubscriptionRow,
  "planTier" | "status" | "currentPeriodEnd" | "nextBillingAt"
>;

export type SubscriptionAccessResult = {
  status: SubscriptionStatus | null;
  planTier: PlanTier | null;
  isActive: boolean;
  canAccessPaidFeatures: boolean;
  isPro: boolean;
  reason?: string;
};

export type PublicSubscription = {
  id: string;
  companyId: string;
  planTier: "FREE" | "PRO";
  isPro: boolean;
  status: string;
  billingCycle: SubscriptionBillingCycle | null;
  subscriptionStartDate: string | null;
  billingAnchorDay: number | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextBillingAt: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function toIso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

export function normalizeBillingCycle(
  billingCycle?: string | null
): SubscriptionBillingCycle {
  return SUBSCRIPTION_BILLING_CYCLES.includes(billingCycle as SubscriptionBillingCycle)
    ? (billingCycle as SubscriptionBillingCycle)
    : DEFAULT_BILLING_CYCLE;
}

export function getDefaultSubscriptionStatus(
  isPro: boolean,
  billingCycle: SubscriptionBillingCycle
): SubscriptionStatus {
  return isPro && billingCycle === "TRIAL"
    ? SubscriptionStatus.TRIALING
    : SubscriptionStatus.ACTIVE;
}

export function subscriptionRequiresFreePlanDowngrade(params: {
  isPro: boolean;
  subscription?: SubscriptionAccessSubscription | null;
  now?: Date;
}): boolean {
  const subscription = params.subscription ?? null;
  if (!params.isPro || !subscription || subscription.planTier !== PlanTier.PRO) {
    return false;
  }

  if (FREE_PLAN_DOWNGRADE_STATUSES.has(subscription.status)) {
    return true;
  }

  const now = params.now ?? new Date();
  const expiresAt = subscription.nextBillingAt ?? subscription.currentPeriodEnd;
  return (
    PAID_ACCESS_STATUSES.has(subscription.status) &&
    expiresAt !== null &&
    expiresAt !== undefined &&
    expiresAt <= now
  );
}

export function resolveSubscriptionAccess(params: {
  isPro: boolean;
  subscription?: SubscriptionAccessSubscription | null;
  now?: Date;
}): SubscriptionAccessResult {
  const subscription = params.subscription ?? null;
  const now = params.now ?? new Date();

  if (!params.isPro) {
    return {
      status: subscription?.status ?? null,
      planTier: PlanTier.FREE,
      isActive: true,
      canAccessPaidFeatures: false,
      isPro: false,
      reason: "Feature requires PRO access. Please upgrade to Pro.",
    };
  }

  if (!subscription) {
    return {
      status: null,
      planTier: PlanTier.PRO,
      isActive: false,
      canAccessPaidFeatures: false,
      isPro: true,
      reason: "Subscription not found.",
    };
  }

  if (subscription.planTier !== PlanTier.PRO) {
    return {
      status: subscription.status,
      planTier: subscription.planTier,
      isActive: false,
      canAccessPaidFeatures: false,
      isPro: true,
      reason: "Subscription is not on a PRO plan.",
    };
  }

  if (!PAID_ACCESS_STATUSES.has(subscription.status)) {
    return {
      status: subscription.status,
      planTier: subscription.planTier,
      isActive: false,
      canAccessPaidFeatures: false,
      isPro: true,
      reason: `Subscription is ${subscription.status}.`,
    };
  }

  const expiresAt = subscription.nextBillingAt ?? subscription.currentPeriodEnd;
  if (expiresAt && expiresAt <= now) {
    return {
      status: SubscriptionStatus.EXPIRED,
      planTier: subscription.planTier,
      isActive: false,
      canAccessPaidFeatures: false,
      isPro: true,
      reason: "Subscription has expired.",
    };
  }

  return {
    status: subscription.status,
    planTier: subscription.planTier,
    isActive: true,
    canAccessPaidFeatures: true,
    isPro: true,
  };
}

/** Maps DB subscription row to API shape (FREE has no cycle/period; PRO has validity based on billingCycle). */
export function mapSubscriptionRowToPublic(sub: SubscriptionRow): PublicSubscription {
  const tier = sub.planTier as "FREE" | "PRO";
  const isPro = tier === "PRO";
  const billingCycle = isPro ? normalizeBillingCycle(sub.billingCycle) : null;
  return {
    id: sub.id,
    companyId: sub.companyId,
    planTier: tier,
    isPro,
    status: sub.status,
    billingCycle,
    subscriptionStartDate:
      isPro && sub.subscriptionStartDate ? toIso(sub.subscriptionStartDate) : null,
    billingAnchorDay: isPro ? sub.billingAnchorDay ?? null : null,
    currentPeriodStart: isPro && sub.currentPeriodStart ? toIso(sub.currentPeriodStart) : null,
    currentPeriodEnd: isPro && sub.currentPeriodEnd ? toIso(sub.currentPeriodEnd) : null,
    nextBillingAt: isPro && sub.nextBillingAt ? toIso(sub.nextBillingAt) : null,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    createdAt: sub.createdAt,
    updatedAt: sub.updatedAt,
  };
}

export const subscriptionService = {
  async downgradeCompanyToFreePlan(
    companyId: string,
    options?: { actorId?: string; reason?: string }
  ): Promise<boolean> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { isPro: true },
    });

    if (!company?.isPro) {
      return false;
    }

    const subscription = await subscriptionRepository.findByCompanyId(companyId);
    if (subscription?.planTier === PlanTier.PRO) {
      const expiresAt = subscription.nextBillingAt ?? subscription.currentPeriodEnd;
      const now = new Date();
      const isDateExpired =
        PAID_ACCESS_STATUSES.has(subscription.status) &&
        expiresAt !== null &&
        expiresAt !== undefined &&
        expiresAt <= now;

      if (
        isDateExpired &&
        !FREE_PLAN_DOWNGRADE_STATUSES.has(subscription.status)
      ) {
        await subscriptionRepository.update(subscription.id, {
          status: SubscriptionStatus.EXPIRED,
        });
      }
    }

    await companyRepository.update(companyId, {
      isPro: false,
      allowedOpenAiChatModels: [],
    });
    await prisma.property.updateMany({
      where: { companyId, deletedAt: null },
      data: { openAiChatModelId: null },
    });
    await this.syncSubscriptionForCompany(companyId, false);

    const actorId =
      options?.actorId ??
      (
        await prisma.user.findFirst({
          where: { role: Role.SUPER_ADMIN },
          select: { id: true },
        })
      )?.id;

    if (actorId) {
      try {
        await moduleControlService.setFreePlanModules(
          companyId,
          actorId,
          options?.reason ?? "Subscription ended - switched to Free plan"
        );
      } catch {
        // Module updates should not block plan downgrade
      }
    }

    return true;
  },

  async ensureCompanyPlanMatchesSubscription(
    companyId: string,
    options?: { actorId?: string; reason?: string }
  ): Promise<boolean> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { isPro: true },
    });

    if (!company?.isPro) {
      return false;
    }

    const subscription = await subscriptionRepository.findByCompanyId(companyId);
    if (
      !subscriptionRequiresFreePlanDowngrade({
        isPro: company.isPro,
        subscription,
      })
    ) {
      return false;
    }

    return this.downgradeCompanyToFreePlan(companyId, options);
  },

  /**
   * Ensures subscription row matches company Pro flag and selected billing validity.
   */
  async syncSubscriptionForCompany(
    companyId: string,
    isPro: boolean,
    billingCycle?: string | null
  ): Promise<void> {
    const planTier = isPro ? PlanTier.PRO : PlanTier.FREE;
    const cycle = normalizeBillingCycle(billingCycle);
    const existing = await subscriptionRepository.findByCompanyId(companyId);
    const defaultStatus = getDefaultSubscriptionStatus(isPro, cycle);

    if (!existing) {
      const period = isPro
        ? buildInitialAnniversaryBillingPeriod(new Date(), cycle)
        : {
            subscriptionStartDate: null,
            billingAnchorDay: null,
            currentPeriodStart: null,
            currentPeriodEnd: null,
            nextBillingAt: null,
          };

      await subscriptionRepository.create({
        companyId,
        planTier,
        billingCycle: isPro ? (cycle as BillingCycle) : null,
        status: defaultStatus,
        subscriptionStartDate: period.subscriptionStartDate,
        billingAnchorDay: period.billingAnchorDay,
        currentPeriodStart: period.currentPeriodStart,
        currentPeriodEnd: period.currentPeriodEnd,
        nextBillingAt: period.nextBillingAt,
      });
      await aiCreditsService.syncCompanyPlanCredits(companyId);
      return;
    }

    const cycleChanged = normalizeBillingCycle(existing.billingCycle) !== cycle;

    const period = isPro
      ? cycleChanged && isFixedDurationBillingCycle(cycle)
        ? buildInitialAnniversaryBillingPeriod(new Date(), cycle)
        : buildActiveAnniversaryBillingPeriod({
          subscriptionStartDate:
            existing.planTier === PlanTier.PRO
              ? existing.subscriptionStartDate ??
                existing.currentPeriodStart ??
                existing.createdAt
              : new Date(),
          billingCycle: cycle,
          billingAnchorDay: existing.billingAnchorDay,
          currentPeriodStart: existing.currentPeriodStart,
          nextBillingAt:
            normalizeBillingCycle(existing.billingCycle) === cycle ? existing.nextBillingAt : null,
        })
      : {
          subscriptionStartDate: null,
          billingAnchorDay: null,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          nextBillingAt: null,
        };

    const status =
      !isPro || existing.planTier === PlanTier.FREE
        ? defaultStatus
        : existing.status;

    await subscriptionRepository.update(existing.id, {
      planTier,
      billingCycle: isPro ? (cycle as BillingCycle) : null,
      status,
      subscriptionStartDate: period.subscriptionStartDate,
      billingAnchorDay: period.billingAnchorDay,
      currentPeriodStart: period.currentPeriodStart,
      currentPeriodEnd: period.currentPeriodEnd,
      nextBillingAt: period.nextBillingAt,
    });
    await aiCreditsService.syncCompanyPlanCredits(companyId);
  },

  async getSubscriptionByCompanyId(companyId: string): Promise<PublicSubscription> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, isPro: true },
    });

    if (!company) {
      throw new AppError(404, "Company not found");
    }

    let sub = await subscriptionRepository.findByCompanyId(companyId);
    if (!sub) {
      await this.syncSubscriptionForCompany(companyId, company.isPro);
      sub = await subscriptionRepository.findByCompanyId(companyId);
    }

    if (!sub) {
      throw new AppError(500, "Subscription could not be loaded");
    }

    if (company.isPro !== (sub.planTier === PlanTier.PRO)) {
      await this.syncSubscriptionForCompany(companyId, company.isPro);
      sub = await subscriptionRepository.findByCompanyId(companyId);
      if (!sub) {
        throw new AppError(500, "Subscription could not be loaded");
      }
    }

    if (sub.planTier === PlanTier.PRO) {
      const cycle = normalizeBillingCycle(sub.billingCycle);
      const period = buildActiveAnniversaryBillingPeriod({
        subscriptionStartDate:
          sub.subscriptionStartDate ?? sub.currentPeriodStart ?? sub.createdAt,
        billingCycle: cycle,
        billingAnchorDay: sub.billingAnchorDay,
        currentPeriodStart: sub.currentPeriodStart,
        nextBillingAt: sub.nextBillingAt,
      });

      const needsUpdate =
        !sub.subscriptionStartDate ||
        sub.billingAnchorDay !== period.billingAnchorDay ||
        !sub.currentPeriodStart ||
        sub.currentPeriodStart.getTime() !== period.currentPeriodStart.getTime() ||
        !sub.currentPeriodEnd ||
        sub.currentPeriodEnd.getTime() !== period.currentPeriodEnd.getTime() ||
        !sub.nextBillingAt ||
        sub.nextBillingAt.getTime() !== period.nextBillingAt.getTime();

      if (needsUpdate) {
        sub = await subscriptionRepository.update(sub.id, {
          billingCycle: cycle as BillingCycle,
          subscriptionStartDate: period.subscriptionStartDate,
          billingAnchorDay: period.billingAnchorDay,
          currentPeriodStart: period.currentPeriodStart,
          currentPeriodEnd: period.currentPeriodEnd,
          nextBillingAt: period.nextBillingAt,
        });
      }
    }

    if (!sub) {
      throw new AppError(500, "Subscription could not be loaded");
    }

    await this.ensureCompanyPlanMatchesSubscription(companyId, {
      reason: "Subscription ended - switched to Free plan",
    });

    sub = await subscriptionRepository.findByCompanyId(companyId);
    if (!sub) {
      throw new AppError(500, "Subscription could not be loaded");
    }

    return mapSubscriptionRowToPublic(sub);
  },

  async getSubscriptionById(id: string, companyId?: string): Promise<PublicSubscription> {
    if (companyId) {
      return this.getSubscriptionByCompanyId(companyId);
    }
    throw new AppError(404, "Subscription not found");
  },
};
