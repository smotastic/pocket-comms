/** One failed input field: `field` is the top-level name the caller sent. */
export interface FieldIssue {
  readonly field: string;
  readonly message: string;
}
