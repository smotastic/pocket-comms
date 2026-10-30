// Violation: a type-position import that does not resolve is an error type too.
export type Missing = import('does-not-exist-either').Missing;
