import * as Schema from 'effect/Schema';

export const Version = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).pipe(
  Schema.brand('Version'),
);
export type Version = typeof Version.Type;

export const initialVersion: Version = Version.make(1);

export const nextVersion = (version: Version): Version => Version.make(version + 1);
