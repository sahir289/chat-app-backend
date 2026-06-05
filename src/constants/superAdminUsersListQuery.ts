/**
 * GET /api/super-admin/users — supported query parameters.
 *
 * - `isActive`: operational access (not raw User.isActive). true = can use the app
 *   (enabled user, verified email, company active, not suspended). false = otherwise.
 * - `role`: ADMIN | AGENT
 * - `isPro`: company subscription tier
 * - `search`: name, email, or company name (case-insensitive)
 */
export const superAdminUsersListQueryKeys = {
  page: "page",
  limit: "limit",
  companyId: "companyId",
  role: "role",
  /** Operational "can use app" filter */
  isActive: "isActive",
  isPro: "isPro",
  search: "search",
} as const;
