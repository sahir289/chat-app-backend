import prisma from "../lib/prisma";
import { Role } from "@prisma/client";

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

    // Check if feature requires PRO access
    if (PRO_FEATURES.includes(feature)) {
      if (!user.company.isPro) {
        return {
          allowed: false,
          reason: "Feature requires PRO access. Please upgrade to Pro.",
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

    const isPro = user.company.isPro;
    const access: Record<FeatureName, boolean> = {} as Record<FeatureName, boolean>;
    const features = PRO_FEATURES;

    for (const feature of features) {
      access[feature] = isPro; // All PRO features require isPro = true
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
        status: "ACTIVE",
        planTier: "PRO",
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

    const isPro = user.company.isPro;

    return {
      status: "ACTIVE", // Always active in simplified model
      planTier: isPro ? "PRO" : "FREE",
      isActive: true,
      canAccessPaidFeatures: isPro,
      isPro,
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

