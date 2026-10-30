// Violation: a port file exports values that are not ports.
export const defaultLimit = 3;

export const limitOf = (value: number) => Math.max(value, defaultLimit);
