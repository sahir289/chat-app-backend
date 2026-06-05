import prisma from "../lib/prisma";
import type { Subscription, Invoice, UsageRecord, SubscriptionChange, PlanTier, BillingCycle, SubscriptionStatus, InvoiceStatus, SubscriptionAction } from "@prisma/client";

export const subscriptionRepository = {
  async findByCompanyId(companyId: string): Promise<Subscription | null> {
    return prisma.subscription.findFirst({
      where: { companyId },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  },

  async findById(id: string, companyId?: string): Promise<Subscription | null> {
    return prisma.subscription.findFirst({
      where: {
        id,
        ...(companyId ? { companyId } : {}),
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  },

  async findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<Subscription | null> {
    return prisma.subscription.findUnique({
      where: { stripeSubscriptionId },
    });
  },

  async create(data: {
    companyId: string;
    planTier: PlanTier;
    billingCycle?: BillingCycle | null;
    status: SubscriptionStatus;
    subscriptionStartDate?: Date | null;
    billingAnchorDay?: number | null;
    currentPeriodStart?: Date | null;
    currentPeriodEnd?: Date | null;
    nextBillingAt?: Date | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    stripePriceId?: string | null;
  }): Promise<Subscription> {
    return prisma.subscription.create({
      data,
    });
  },

  async update(id: string, data: {
    planTier?: PlanTier;
    billingCycle?: BillingCycle | null;
    status?: SubscriptionStatus;
    subscriptionStartDate?: Date | null;
    billingAnchorDay?: number | null;
    currentPeriodStart?: Date | null;
    currentPeriodEnd?: Date | null;
    nextBillingAt?: Date | null;
    cancelAtPeriodEnd?: boolean;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    stripePriceId?: string | null;
  }): Promise<Subscription> {
    return prisma.subscription.update({
      where: { id },
      data,
    });
  },

  async listAll(companyId?: string): Promise<Subscription[]> {
    return prisma.subscription.findMany({
      where: companyId ? { companyId } : undefined,
      include: {
        company: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async createInvoice(data: {
    subscriptionId: string;
    amount: number;
    currency: string;
    status: InvoiceStatus;
    periodStart: Date;
    periodEnd: Date;
    stripeInvoiceId?: string | null;
    invoiceUrl?: string | null;
    pdfUrl?: string | null;
    paidAt?: Date | null;
  }): Promise<Invoice> {
    return prisma.invoice.create({
      data,
    });
  },

  async findInvoiceById(id: string): Promise<Invoice | null> {
    return prisma.invoice.findUnique({
      where: { id },
      include: {
        subscription: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  },

  async listInvoices(subscriptionId?: string, companyId?: string): Promise<Invoice[]> {
    const where: any = {};
    if (subscriptionId) {
      where.subscriptionId = subscriptionId;
    }
    if (companyId) {
      where.subscription = { companyId };
    }

    return prisma.invoice.findMany({
      where,
      include: {
        subscription: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async createUsageRecord(data: {
    subscriptionId: string;
    metric: string;
    quantity: number;
    limit?: number | null;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<UsageRecord> {
    return prisma.usageRecord.create({
      data,
    });
  },

  async listUsageRecords(subscriptionId: string, metric?: string): Promise<UsageRecord[]> {
    return prisma.usageRecord.findMany({
      where: {
        subscriptionId,
        ...(metric ? { metric } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async createSubscriptionChange(data: {
    subscriptionId: string;
    changedBySuperAdminId: string;
    action: SubscriptionAction;
    oldPlanTier?: PlanTier | null;
    newPlanTier?: PlanTier | null;
    oldStatus?: SubscriptionStatus | null;
    newStatus?: SubscriptionStatus | null;
    reason?: string | null;
  }): Promise<SubscriptionChange> {
    return prisma.subscriptionChange.create({
      data,
    });
  },

  async listSubscriptionChanges(subscriptionId: string): Promise<SubscriptionChange[]> {
    return prisma.subscriptionChange.findMany({
      where: { subscriptionId },
      include: {
        changedBySuperAdmin: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  },
};

