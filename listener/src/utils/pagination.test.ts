import {
  buildPaginationMetadata,
  calculateTotalPages,
  normalizePaginationParams,
} from './pagination';

describe('normalizePaginationParams', () => {
  it('applies defaults when params are missing', () => {
    expect(normalizePaginationParams()).toEqual({ limit: 20, offset: 0 });
  });

  it('clamps limit to the configured maximum', () => {
    expect(normalizePaginationParams(200, 0)).toEqual({ limit: 100, offset: 0 });
  });

  it('rejects negative and non-finite values', () => {
    expect(normalizePaginationParams(-5, -10)).toEqual({ limit: 1, offset: 0 });
    expect(normalizePaginationParams(Number.NaN, Number.NaN)).toEqual({ limit: 20, offset: 0 });
  });
});

describe('calculateTotalPages', () => {
  it('returns 0 when item count is zero', () => {
    expect(calculateTotalPages(0, 20)).toBe(0);
  });

  it('returns 0 when limit is zero or negative', () => {
    expect(calculateTotalPages(10, 0)).toBe(0);
    expect(calculateTotalPages(10, -5)).toBe(0);
  });

  it('returns 1 when items fit within a single page', () => {
    expect(calculateTotalPages(1, 20)).toBe(1);
    expect(calculateTotalPages(20, 20)).toBe(1);
  });

  it('rounds up when items spill into another page', () => {
    expect(calculateTotalPages(21, 20)).toBe(2);
    expect(calculateTotalPages(5, 2)).toBe(3);
  });
});

describe('buildPaginationMetadata', () => {
  it('returns zeroed metadata for empty result sets', () => {
    expect(buildPaginationMetadata(0, 20, 0)).toEqual({
      itemCount: 0,
      totalPages: 0,
      limit: 20,
      offset: 0,
    });
  });

  it('normalizes negative inputs to safe boundaries', () => {
    expect(buildPaginationMetadata(-3, 0, -10)).toEqual({
      itemCount: 0,
      totalPages: 0,
      limit: 1,
      offset: 0,
    });
  });

  it('includes total pages and item count for multi-page results', () => {
    expect(buildPaginationMetadata(5, 2, 2)).toEqual({
      itemCount: 5,
      totalPages: 3,
      limit: 2,
      offset: 2,
    });
  });

  it('preserves offset beyond the final page', () => {
    expect(buildPaginationMetadata(5, 2, 10)).toEqual({
      itemCount: 5,
      totalPages: 3,
      limit: 2,
      offset: 10,
    });
  });
});
