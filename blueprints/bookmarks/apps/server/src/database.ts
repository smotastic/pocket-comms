import { PgClient } from '@effect/sql-pg';
import * as Config from 'effect/Config';

/** The client of the server's database; the URL is a secret (ADR 0004). */
export const databaseLayer = PgClient.layerConfig({ url: Config.Redacted('DATABASE_URL') });
