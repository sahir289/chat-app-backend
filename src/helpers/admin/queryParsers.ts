import { Role } from "@prisma/client";

type AllowedRole = Exclude<Role, "SUPER_ADMIN">;
const allowedRoles: AllowedRole[] = [Role.ADMIN, Role.AGENT];

export function parseIntSafe(v: unknown, fallback: number, min = 1, max?: number) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    const i = Math.floor(n);
    if (i < min) return fallback;
    if (max !== undefined && i > max) return fallback;
    return i;
}

export function parseBool(v: unknown): boolean | undefined {
    if (v === undefined) return undefined;
    if (v === "true" || v === true) return true;
    if (v === "false" || v === false) return false;
    return undefined;
}

export function parseAllowedRole(v: unknown): AllowedRole | undefined {
    if (typeof v !== "string") return undefined;
    return allowedRoles.includes(v as AllowedRole) ? (v as AllowedRole) : undefined;
}

export function isValidISODate(v: unknown): v is string {
    if (typeof v !== "string") return false;
    const d = new Date(v);
    return !Number.isNaN(d.getTime());
}