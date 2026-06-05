import type { PlanTier, Subscription as SubscriptionRow } from "@prisma/client";
import prisma from "../lib/prisma";
import { AppError } from "../utils/appError";
import { subscriptionRepository } from "../repositories/subscriptionRepository";
import { aiCreditsService } from "./aiCreditsService";
import {
  buildActiveAnniversaryBillingPeriod,
  buildInitialAnniversaryBillingPeriod,
} from "../utils/billingPeriod";

export type PublicSubscription = {
  id: string;
  companyId: string;
  planTier: "FREE" | "PRO";
  isPro: boolean;
  status: string;
  billingCycle: "MONTHLY" | null;
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

/** Maps DB subscription row to API shape (FREE has no cycle/period; PRO is monthly with UTC month window). */
export function mapSubscriptionRowToPublic(sub: SubscriptionRow): PublicSubscription {
  const tier = sub.planTier as "FREE" | "PRO";
  const isPro = tier === "PRO";
  return {
    id: sub.id,
    companyId: sub.companyId,
    planTier: tier,
    isPro,
    status: sub.status,
    billingCycle: isPro ? "MONTHLY" : null,
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
  /**
   * Ensures subscription row matches company Pro flag (anniversary monthly period for PRO).
   */
  async syncSubscriptionForCompany(companyId: string, isPro: boolean): Promise<void> {
    const planTier = (isPro ? "PRO" : "FREE") as PlanTier;
    const existing = await subscriptionRepository.findByCompanyId(companyId);

    if (!existing) {
      const period = isPro
        ? buildInitialAnniversaryBillingPeriod(new Date())
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
        billingCycle: isPro ? "MONTHLY" : null,
        status: "ACTIVE",
        subscriptionStartDate: period.subscriptionStartDate,
        billingAnchorDay: period.billingAnchorDay,
        currentPeriodStart: period.currentPeriodStart,
        currentPeriodEnd: period.currentPeriodEnd,
        nextBillingAt: period.nextBillingAt,
      });
      await aiCreditsService.syncCompanyPlanCredits(companyId);
      return;
    }

    const period = isPro
      ? buildActiveAnniversaryBillingPeriod({
          subscriptionStartDate:
            (existing.planTier as "FREE" | "PRO") === "PRO"
              ? existing.subscriptionStartDate ??
                existing.currentPeriodStart ??
                existing.createdAt
              : new Date(),
          billingAnchorDay: existing.billingAnchorDay,
          currentPeriodStart: existing.currentPeriodStart,
          nextBillingAt: existing.nextBillingAt,
        })
      : {
          subscriptionStartDate: null,
          billingAnchorDay: null,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          nextBillingAt: null,
        };

    await subscriptionRepository.update(existing.id, {
      planTier,
      billingCycle: isPro ? "MONTHLY" : null,
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

    if (company.isPro !== ((sub.planTier as "FREE" | "PRO") === "PRO")) {
      await this.syncSubscriptionForCompany(companyId, company.isPro);
      sub = await subscriptionRepository.findByCompanyId(companyId);
      if (!sub) {
        throw new AppError(500, "Subscription could not be loaded");
      }
    }

    if ((sub.planTier as "FREE" | "PRO") === "PRO") {
      const period = buildActiveAnniversaryBillingPeriod({
        subscriptionStartDate:
          sub.subscriptionStartDate ?? sub.currentPeriodStart ?? sub.createdAt,
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
          billingCycle: "MONTHLY",
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

    return mapSubscriptionRowToPublic(sub);
  },

  async getSubscriptionById(id: string, companyId?: string): Promise<PublicSubscription> {
    if (companyId) {
      return this.getSubscriptionByCompanyId(companyId);
    }
    throw new AppError(404, "Subscription not found");
  },
};
