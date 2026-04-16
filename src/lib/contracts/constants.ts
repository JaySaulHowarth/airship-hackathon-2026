/**
 * Locked product constants for Phase 0. Adjust `TABLE_NUMBER_MAX` if the venue
 * uses a different numeric table range; keep server validation in sync.
 */
export const TABLE_NUMBER_MIN = 1;
export const TABLE_NUMBER_MAX = 99;

/** Staff filter UX: PRD §5.3 Option A (recommended). */
export const STAFF_FILTER_OPTION = "A" as const;

/**
 * Under Option A, orders with no matching lines for the active filter are hidden
 * (e.g. drinks-only order does not appear in Food filter). PRD §8.
 */
export const OPTION_A_EMPTY_FILTER_BEHAVIOR = "hide_order" as const;

/**
 * Prices are locked when the order is submitted: line snapshots use menu state
 * at submit. PRD §8 (add-to-cart vs submit — we chose submit).
 */
export const PRICE_LOCK_MOMENT = "submit" as const;

/** Optional order note; align server validation with this max. PRD §8. */
export const ORDER_NOTE_MAX_LENGTH = 500;
