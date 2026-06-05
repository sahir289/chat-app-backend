import prisma from "../lib/prisma";
import type { FeatureFlag } from "@prisma/client";

export const featureFlagRepository = {

  async findByCompanyId(companyId: string): Promise<FeatureFlag[]> {
    return prisma.featureFlag.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });
  },

  async findByCompanyAndFeature(companyId: string, feature: string): Promise<FeatureFlag | null> {
    return prisma.featureFlag.findUnique({
      where: {
        companyId_feature: {
          companyId,
          feature,
        },
      },
    });
  },

  async createOrUpdate(data: {
    companyId: string;
    feature: string;
    enabled: boolean;
  }): Promise<FeatureFlag> {
    return prisma.featureFlag.upsert({
      where: {
        companyId_feature: {
          companyId: data.companyId,
          feature: data.feature,
        },
      },
      create: {
        companyId: data.companyId,
        feature: data.feature,
        enabled: data.enabled,
      },
      update: {
        enabled: data.enabled,
      },
    });
  },

  async delete(companyId: string, feature: string): Promise<void> {
    await prisma.featureFlag.delete({
      where: {
        companyId_feature: {
          companyId,
          feature,
        },
      },
    });
  },

  async setModuleEnabled(companyId: string, module: string, enabled: boolean): Promise<FeatureFlag> {
    return this.createOrUpdate({
      companyId,
      feature: module,
      enabled,
    });
  },
};

