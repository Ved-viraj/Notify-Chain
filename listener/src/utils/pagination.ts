export interface PaginationMetadata {
  itemCount: number;
  totalPages: number;
  limit: number;
  offset: number;
}

export interface PaginationQueryParams {
  limit: number;
  offset: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * Normalizes limit/offset query params before database pagination.
 */
export function normalizePaginationParams(
  limit?: number,
  offset?: number,
): PaginationQueryParams {
  const parsedLimit = Number.isFinite(limit) ? Math.trunc(limit!) : DEFAULT_PAGE_SIZE;
  const parsedOffset = Number.isFinite(offset) ? Math.trunc(offset!) : 0;

  return {
    limit: Math.min(Math.max(1, parsedLimit), MAX_PAGE_SIZE),
    offset: Math.max(0, parsedOffset),
  };
}

/**
 * Builds standardized pagination metadata for offset/limit list responses.
 */
export function buildPaginationMetadata(
  itemCount: number,
  limit: number,
  offset: number,
): PaginationMetadata {
  const normalizedItemCount = Math.max(0, itemCount);
  const normalizedLimit = Math.max(1, limit);
  const normalizedOffset = Math.max(0, offset);

  return {
    itemCount: normalizedItemCount,
    totalPages: calculateTotalPages(normalizedItemCount, normalizedLimit),
    limit: normalizedLimit,
    offset: normalizedOffset,
  };
}

export function calculateTotalPages(itemCount: number, limit: number): number {
  if (itemCount <= 0 || limit <= 0) {
    return 0;
  }

  return Math.ceil(itemCount / limit);
}
