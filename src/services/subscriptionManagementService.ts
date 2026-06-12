import { subscriptionRepository } from "../repositories/subscriptionRepository";
import { AppError } from "../utils/appError";
import {
  PlanTier,
  SubscriptionStatus,
  type BillingCycle,
  type SubscriptionAction,
} from "@prisma/client";
import prisma from "../lib/prisma";
import {
  buildActiveAnniversaryBillingPeriod,
  buildInitialAnniversaryBillingPeriod,
  isFixedDurationBillingCycle,
} from "../utils/billingPeriod";
import {
  DEFAULT_BILLING_CYCLE,
  getDefaultSubscriptionStatus,
  normalizeBillingCycle,
  type SubscriptionBillingCycle,
} from "./subscriptionService";
export const subscriptionManagementService = {
  async activateSubscription(
    subscriptionId: string,
    superAdminId: string,
    reason?: string
  ) {
    const subscription = await subscriptionRepository.findById(subscriptionId);
    if (!subscription) {
      throw new AppError(404, "Subscription not found");
    }

    const oldStatus = subscription.status;
    const updated = await subscriptionRepository.update(subscriptionId, {
      status: SubscriptionStatus.ACTIVE,
    });

    await subscriptionRepository.createSubscriptionChange({
      subscriptionId,
      changedBySuperAdminId: superAdminId,
      action: "ACTIVATE",
      oldStatus,
      newStatus: SubscriptionStatus.ACTIVE,
      reason,
    });

    await this.logAudit(superAdminId, "SUBSCRIPTION", subscription.companyId, {
      action: "ACTIVATE",
      subscriptionId,
      oldStatus,
      newStatus: SubscriptionStatus.ACTIVE,
      reason,
    });

    return updated;
  },

  async suspendSubscription(
    subscriptionId: string,
    superAdminId: string,
    reason?: string
  ) {
    const subscription = await subscriptionRepository.findById(subscriptionId);
    if (!subscription) {
      throw new AppError(404, "Subscription not found");
    }

    const oldStatus = subscription.status;
    const updated = await subscriptionRepository.update(subscriptionId, {
      status: SubscriptionStatus.SUSPENDED,
    });

    await subscriptionRepository.createSubscriptionChange({
      subscriptionId,
      changedBySuperAdminId: superAdminId,
      action: "SUSPEND",
      oldStatus,
      newStatus: SubscriptionStatus.SUSPENDED,
      reason,
    });

    await this.logAudit(superAdminId, "SUBSCRIPTION", subscription.companyId, {
      action: "SUSPEND",
      subscriptionId,
      oldStatus,
      newStatus: SubscriptionStatus.SUSPENDED,
      reason,
    });

    return updated;
  },

  async deactivateSubscription(
    subscriptionId: string,
    superAdminId: string,
    reason?: string
  ) {
    const subscription = await subscriptionRepository.findById(subscriptionId);
    if (!subscription) {
      throw new AppError(404, "Subscription not found");
    }

    const oldStatus = subscription.status;
    const updated = await subscriptionRepository.update(subscriptionId, {
      status: SubscriptionStatus.CANCELED,
    });

    await subscriptionRepository.createSubscriptionChange({
      subscriptionId,
      changedBySuperAdminId: superAdminId,
      action: "CANCEL",
      oldStatus,
      newStatus: SubscriptionStatus.CANCELED,
      reason,
    });

    await this.logAudit(superAdminId, "SUBSCRIPTION", subscription.companyId, {
      action: "CANCEL",
      subscriptionId,
      oldStatus,
      newStatus: SubscriptionStatus.CANCELED,
      reason,
    });

    return updated;
  },

  async changePlanTier(
    subscriptionId: string,
    newPlanTier: PlanTier,
    superAdminId: string,
    reason?: string,
    billingCycle?: string | null
  ) {
    const subscription = await subscriptionRepository.findById(subscriptionId);
    if (!subscription) {
      throw new AppError(404, "Subscription not found");
    }

    const oldPlanTier = subscription.planTier;
    const cycle: SubscriptionBillingCycle =
      newPlanTier === PlanTier.PRO
        ? normalizeBillingCycle(billingCycle ?? subscription.billingCycle ?? DEFAULT_BILLING_CYCLE)
        : DEFAULT_BILLING_CYCLE;
    const cycleChanged = normalizeBillingCycle(subscription.billingCycle) !== cycle;
    const period =
      newPlanTier === PlanTier.PRO
        ? oldPlanTier === PlanTier.PRO
          ? cycleChanged && isFixedDurationBillingCycle(cycle)
            ? buildInitialAnniversaryBillingPeriod(new Date(), cycle)
            : buildActiveAnniversaryBillingPeriod({
              subscriptionStartDate:
                subscription.subscriptionStartDate ??
                subscription.currentPeriodStart ??
                subscription.createdAt,
              billingCycle: cycle,
              billingAnchorDay: subscription.billingAnchorDay,
              currentPeriodStart: subscription.currentPeriodStart,
              nextBillingAt:
                normalizeBillingCycle(subscription.billingCycle) === cycle ? subscription.nextBillingAt : null,
            })
          : buildInitialAnniversaryBillingPeriod(new Date(), cycle)
        : {
            subscriptionStartDate: null,
            billingAnchorDay: null,
            currentPeriodStart: null,
            currentPeriodEnd: null,
            nextBillingAt: null,
          };
    const status =
      newPlanTier === PlanTier.PRO && oldPlanTier === PlanTier.PRO
        ? subscription.status
        : getDefaultSubscriptionStatus(newPlanTier === PlanTier.PRO, cycle);

    const updated = await subscriptionRepository.update(subscriptionId, {
      planTier: newPlanTier,
      billingCycle: newPlanTier === PlanTier.PRO ? (cycle as BillingCycle) : null,
      status,
      subscriptionStartDate: period.subscriptionStartDate,
      billingAnchorDay: period.billingAnchorDay,
      currentPeriodStart: period.currentPeriodStart,
      currentPeriodEnd: period.currentPeriodEnd,
      nextBillingAt: period.nextBillingAt,
    });

    await subscriptionRepository.createSubscriptionChange({
      subscriptionId,
      changedBySuperAdminId: superAdminId,
      action:
        oldPlanTier === PlanTier.FREE
          ? "UPGRADE"
          : newPlanTier === PlanTier.FREE
            ? "DOWNGRADE"
            : "UPGRADE",
      oldPlanTier,
      newPlanTier,
      reason,
    });

    await this.logAudit(superAdminId, "SUBSCRIPTION", subscription.companyId, {
      action: "CHANGE_PLAN",
      subscriptionId,
      oldPlanTier,
      newPlanTier,
      reason,
    });

    return updated;
  },

  async changeStatus(
    subscriptionId: string,
    newStatus: SubscriptionStatus,
    superAdminId: string,
    reason?: string
  ) {
    const subscription = await subscriptionRepository.findById(subscriptionId);
    if (!subscription) {
      throw new AppError(404, "Subscription not found");
    }

    const oldStatus = subscription.status;
    const updated = await subscriptionRepository.update(subscriptionId, {
      status: newStatus,
    });

    let action: SubscriptionAction = "ACTIVATE";
    if (newStatus === SubscriptionStatus.SUSPENDED || newStatus === SubscriptionStatus.PAST_DUE) {
      action = "SUSPEND";
    } else if (newStatus === SubscriptionStatus.CANCELED || newStatus === SubscriptionStatus.EXPIRED) {
      action = "CANCEL";
    } else if (
      (newStatus === SubscriptionStatus.ACTIVE || newStatus === SubscriptionStatus.TRIALING) &&
      oldStatus !== newStatus
    ) {
      action = "ACTIVATE";
    }

    await subscriptionRepository.createSubscriptionChange({
      subscriptionId,
      changedBySuperAdminId: superAdminId,
      action,
      oldStatus,
      newStatus,
      reason,
    });

    await this.logAudit(superAdminId, "SUBSCRIPTION", subscription.companyId, {
      action: "CHANGE_STATUS",
      subscriptionId,
      oldStatus,
      newStatus,
      reason,
    });

    return updated;
  },

  async getAllSubscriptionsWithCompanies() {
    const subscriptions = await subscriptionRepository.listAll();

    const subscriptionsWithCompanies = await Promise.all(
      subscriptions.map(async (sub) => {
        const company = await prisma.company.findUnique({
          where: { id: sub.companyId },
          select: {
            id: true,
            name: true,
            email: true,
            isSuspended: true,
            createdAt: true,
          },
        });

        const changes = await subscriptionRepository.listSubscriptionChanges(sub.id);

        return {
          ...sub,
          company,
          recentChanges: changes.slice(0, 5),
        };
      })
    );

    return subscriptionsWithCompanies;
  },

  async getSubscriptionDetails(subscriptionId: string) {
    const subscription = await subscriptionRepository.findById(subscriptionId);
    if (!subscription) {
      throw new AppError(404, "Subscription not found");
    }

    const company = await prisma.company.findUnique({
      where: { id: subscription.companyId },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    const changes = await subscriptionRepository.listSubscriptionChanges(subscriptionId);
    const invoices = await subscriptionRepository.listInvoices(subscriptionId);
    const usageRecords = await subscriptionRepository.listUsageRecords(subscriptionId);

    return {
      subscription,
      company,
      changes,
      invoices,
      usageRecords,
    };
  },

  async logAudit(
    userId: string,
    resourceType: string,
    resourceId: string,
    metadata: any
  ) {
    try {
      await prisma.auditLog.create({
        data: {
          userId,
          resourceType: resourceType as any,
          resourceId,
          action: "UPDATE",
          metadata: metadata as any,
          ipAddress: null,
          userAgent: null,
        },
      });
    } catch (error) {
    }
  },
};

