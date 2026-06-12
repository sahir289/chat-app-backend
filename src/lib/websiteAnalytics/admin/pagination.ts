export type PaginationParams = {
    page: number;
    limit: number;
    skip: number;
};

export type PaginationMeta = {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
};

// Backwards-compatible alias
export type PaginationMetaCompatible = PaginationMeta & { nextCursor?: string | null };

// Add optional cursor to pagination metadata for keyset pagination
export type PaginationMetaWithCursor = PaginationMeta & { nextCursor?: string | null };

export type CursorPaginationParams = {
    cursor?: string | null;
    limit: number;
};

export type CursorPaginationMeta = {
    nextCursor?: string | null;
    limit: number;
};

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 150] as const;

const DEFAULT_LIMIT = PAGE_SIZE_OPTIONS[0];

export function parsePageLimit(raw: string | null): number {
    if (!raw) {
        return DEFAULT_LIMIT;
    }

    const parsed = Number.parseInt(raw, 10);

    if (PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number])) {
        return parsed;
    }

    return DEFAULT_LIMIT;
}

export function parsePagination(searchParams: URLSearchParams): PaginationParams {
    const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const limit = parsePageLimit(searchParams.get("limit"));

    return {
        page,
        limit,
        skip: (page - 1) * limit,
    };
}

export function parseCursorPagination(searchParams: URLSearchParams): CursorPaginationParams {
    const limit = parsePageLimit(searchParams.get("limit"));
    const cursor = searchParams.get("cursor");
    return { cursor, limit };
}

export function encodeCursor(value: string, id: string): string {
    return Buffer.from(`${value}::${id}`).toString("base64");
}

export function decodeCursor(cursor: string): { value: string; id: string } | null {
    try {
        const decoded = Buffer.from(cursor, "base64").toString("utf8");
        const parts = decoded.split("::");
        if (parts.length !== 2) return null;
        return { value: parts[0], id: parts[1] };
    } catch {
        return null;
    }
}

export function clampPagination(
    total: number,
    page: number,
    limit: number
): { page: number; skip: number } {
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    const clampedPage = totalPages === 0 ? 1 : Math.min(Math.max(1, page), totalPages);

    return {
        page: clampedPage,
        skip: (clampedPage - 1) * limit,
    };
}

export function buildPaginationMeta(
    total: number,
    page: number,
    limit: number
): PaginationMeta {
    return {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
}

export function buildPaginationMetaWithCursor(nextCursor: string | undefined, limit: number): PaginationMeta & { nextCursor?: string | null } {
    return {
        page: 1,
        limit,
        total: 0,
        totalPages: 0,
        nextCursor: nextCursor ?? null,
    };
}

export function parseOptionalDate(
    searchParams: URLSearchParams,
    key: string
): Date | undefined {
    const value = searchParams.get(key);

    if (!value) {
        return undefined;
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? undefined : date;
}

export function parseOptionalBoolean(
    searchParams: URLSearchParams,
    key: string
): boolean | undefined {
    const value = searchParams.get(key);

    if (value === null) {
        return undefined;
    }

    if (value === "true" || value === "1") {
        return true;
    }

    if (value === "false" || value === "0") {
        return false;
    }

    return undefined;
}

export function buildDateRange(
    from?: Date,
    to?: Date
): { gte?: Date; lte?: Date } | undefined {
    if (!from && !to) {
        return undefined;
    }

    return {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
    };
}
