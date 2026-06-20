const CONTRACT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/**
 * Returns true when a contract route id is safe to render and use for lookups.
 * Contract ids are bounded to 64 URL-safe characters to avoid reflecting
 * arbitrary path fragments, markup, or oversized input.
 */
export const isValidContractId = (id: string): boolean => CONTRACT_ID_PATTERN.test(id);

