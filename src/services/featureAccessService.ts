import prisma from "../lib/prisma";
import { PlanTier, Role, SubscriptionStatus } from "@prisma/client";
import {
  resolveSubscriptionAccess,
  subscriptionAccessSelect,
  subscriptionService,
} from "./subscriptionService";

export type FeatureName =
  | "advanced_analytics"
  | "custom_branding"
  | "api_access"
  | "webhooks"
  | "priority_support"
  | "custom_integrations"
  | "unlimited_agents"
  | "advanced_automation"
  | "data_export"
  | "sso";

// In simplified model: FREE = limited features, PRO = all premium features
// All features listed here require PRO access
const PRO_FEATURES: FeatureName[] = [
  "advanced_analytics",
  "custom_branding",
  "api_access",
  "webhooks",
  "priority_support",
  "custom_integrations",
  "unlimited_agents",
  "advanced_automation",
  "data_export",
  "sso",
];

export const featureAccessService = {
  async checkFeatureAccess(
    userId: string,
    feature: FeatureName
  ): Promise<{ allowed: boolean; reason?: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: {
          select: {
            id: true,
            isPro: true,
            subscriptions: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: subscriptionAccessSelect,
            },
          },
        },
      },
    });

    if (!user) {
      return { allowed: false, reason: "User not found" };
    }

    if (user.isSuperAdmin || user.role === Role.SUPER_ADMIN) {
      return { allowed: true };
    }

    if (user.role === Role.AGENT) {
      return { allowed: false, reason: "Agents do not have feature access" };
    }

    if (!user.company) {
      return { allowed: false, reason: "No company found" };
    }

    const downgraded = await subscriptionService.ensureCompanyPlanMatchesSubscription(user.company.id);
    if (downgraded) {
      user.company.isPro = false;
    }

    const subscriptionAccess = resolveSubscriptionAccess({
      isPro: user.company.isPro,
      subscription: user.company.subscriptions[0] ?? null,
    });

    // Check if feature requires active PRO access
    if (PRO_FEATURES.includes(feature)) {
      if (!subscriptionAccess.canAccessPaidFeatures) {
        return {
          allowed: false,
          reason: subscriptionAccess.reason,
        };
      }
    }

    return { allowed: true };
  },

  async getUserFeatureAccess(userId: string): Promise<Record<FeatureName, boolean>> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: {
          select: {
            id: true,
            isPro: true,
            subscriptions: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: subscriptionAccessSelect,
            },
          },
        },
      },
    });

    if (!user) {
      return this.getAllFeaturesDenied();
    }

    if (user.isSuperAdmin || user.role === Role.SUPER_ADMIN) {
      return this.getAllFeaturesAllowed();
    }

    if (user.role === Role.AGENT) {
      return this.getAllFeaturesDenied();
    }

    if (!user.company) {
      return this.getAllFeaturesDenied();
    }

    const downgraded = await subscriptionService.ensureCompanyPlanMatchesSubscription(user.company.id);
    if (downgraded) {
      user.company.isPro = false;
    }

    const subscriptionAccess = resolveSubscriptionAccess({
      isPro: user.company.isPro,
      subscription: user.company.subscriptions[0] ?? null,
    });
    const access: Record<FeatureName, boolean> = {} as Record<FeatureName, boolean>;
    const features = PRO_FEATURES;

    for (const feature of features) {
      access[feature] = subscriptionAccess.canAccessPaidFeatures;
    }

    return access;
  },

  async getSubscriptionStatus(userId: string): Promise<{
    status: string | null;
    planTier: string | null;
    isActive: boolean;
    canAccessPaidFeatures: boolean;
    isPro: boolean;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: {
          select: {
            id: true,
            isPro: true,
            subscriptions: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: subscriptionAccessSelect,
            },
          },
        },
      },
    });

    if (!user) {
      return {
        status: null,
        planTier: "FREE",
        isActive: false,
        canAccessPaidFeatures: false,
        isPro: false,
      };
    }

    if (user.isSuperAdmin || user.role === Role.SUPER_ADMIN) {
      return {
        status: SubscriptionStatus.ACTIVE,
        planTier: PlanTier.PRO,
        isActive: true,
        canAccessPaidFeatures: true,
        isPro: true,
      };
    }

    if (!user.company) {
      return {
        status: null,
        planTier: "FREE",
        isActive: false,
        canAccessPaidFeatures: false,
        isPro: false,
      };
    }

    const downgraded = await subscriptionService.ensureCompanyPlanMatchesSubscription(user.company.id);
    if (downgraded) {
      user.company.isPro = false;
    }

    const subscriptionAccess = resolveSubscriptionAccess({
      isPro: user.company.isPro,
      subscription: user.company.subscriptions[0] ?? null,
    });

    return {
      status: subscriptionAccess.status,
      planTier: subscriptionAccess.planTier,
      isActive: subscriptionAccess.isActive,
      canAccessPaidFeatures: subscriptionAccess.canAccessPaidFeatures,
      isPro: subscriptionAccess.isPro,
    };
  },

  getAllFeaturesAllowed(): Record<FeatureName, boolean> {
    return PRO_FEATURES.reduce((acc, feature) => {
      acc[feature] = true;
      return acc;
    }, {} as Record<FeatureName, boolean>);
  },

  getAllFeaturesDenied(): Record<FeatureName, boolean> {
    return PRO_FEATURES.reduce((acc, feature) => {
      acc[feature] = false;
      return acc;
    }, {} as Record<FeatureName, boolean>);
  },
};

