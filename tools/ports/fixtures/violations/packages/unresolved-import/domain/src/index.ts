// Violation: an import that does not resolve turns its types into error types.
import { missing } from 'does-not-exist';

export const value = missing;
