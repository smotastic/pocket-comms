// Violation: a `*.port.ts` file outside an application layer.
export interface Clock {
  readonly now: number;
}
