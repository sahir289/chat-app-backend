import { Role } from "@prisma/client";
import prisma from "../lib/prisma";

export type PropertyDefaultAgent = {
  id: string;
  name: string | null;
  email: string;
};

export async function getPropertyDefaultAgents(
  companyId: string,
  propertyIds: string[]
): Promise<Map<string, PropertyDefaultAgent>> {
  const uniquePropertyIds = Array.from(new Set(propertyIds.filter(Boolean)));
  const result = new Map<string, PropertyDefaultAgent>();

  if (uniquePropertyIds.length === 0) {
    return result;
  }

  const assignments = await prisma.agentPropertyAccess.findMany({
    where: {
      propertyId: { in: uniquePropertyIds },
      user: {
        companyId,
        role: Role.AGENT,
        isActive: true,
        deletedAt: null,
      },
    },
    select: {
      propertyId: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: [
      {
        propertyId: "asc",
      },
      {
        user: {
          name: "asc",
        },
      },
      {
        user: {
          email: "asc",
        },
      },
    ],
  });

  const grouped = new Map<string, PropertyDefaultAgent[]>();
  for (const item of assignments) {
    const list = grouped.get(item.propertyId) ?? [];
    list.push({
      id: item.user.id,
      name: item.user.name,
      email: item.user.email,
    });
    grouped.set(item.propertyId, list);
  }

  for (const [propertyId, agents] of grouped.entries()) {
    if (agents.length === 1) {
      result.set(propertyId, agents[0]);
    }
  }

  return result;
}
