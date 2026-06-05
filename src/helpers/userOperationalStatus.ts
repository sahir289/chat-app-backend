import type { Prisma } from "@prisma/client";

/**
 * Whether the user can operate in the app: account enabled, email verified,
 * and company is running (not inactive / suspended / deleted).
 */
export function isUserOperationallyActive(
  user: { isActive: boolean; emailVerified: boolean },
  company: { isActive: boolean; isSuspended: boolean; deletedAt: Date | null } | null
): boolean {
  if (!company || company.deletedAt) {
    return false;
  }
  return (
    user.isActive &&
    user.emailVerified &&
    company.isActive &&
    !company.isSuspended
  );
}

/**
 * Prisma `where` for users that are operationally active (matches
 * `isUserOperationallyActive` for users that have a company row).
 */
export function whereOperationallyActiveUsers(): Prisma.UserWhereInput {
  return {
    isActive: true,
    emailVerified: true,
    company: {
      isActive: true,
      isSuspended: false,
      deletedAt: null,
    },
  };
}

/**
 * Prisma `where` for users that are not operationally active.
 */
export function whereOperationallyInactiveUsers(): Prisma.UserWhereInput {
  return {
    OR: [
      { isActive: false },
      { emailVerified: false },
      { company: null },
      { company: { isActive: false } },
      { company: { isSuspended: true } },
      { company: { deletedAt: { not: null } } },
    ],
  };
}
