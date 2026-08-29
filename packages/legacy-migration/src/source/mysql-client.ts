/**
 * The one `mysql2` pool this whole tree opens. `queries.ts` is the only
 * module that ever calls into it — nothing else here imports `mysql2`.
 */
import { Pool, createPool } from 'mysql2/promise';
import { DEFAULT_LEGACY_TIMEZONE } from '../mapping.config';

export interface LegacyConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function readLegacyConnectionConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LegacyConnectionConfig {
  const missing = ['LEGACY_MYSQL_HOST', 'LEGACY_MYSQL_USER', 'LEGACY_MYSQL_PASSWORD', 'LEGACY_MYSQL_DATABASE'].filter(
    (key) => !env[key],
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing legacy MySQL connection settings: ${missing.join(', ')}. ` +
        'See .env.example ("Legacy migration") — these are read only by migrate:legacy.',
    );
  }
  return {
    host: env.LEGACY_MYSQL_HOST!,
    port: Number(env.LEGACY_MYSQL_PORT ?? 3306),
    user: env.LEGACY_MYSQL_USER!,
    password: env.LEGACY_MYSQL_PASSWORD!,
    database: env.LEGACY_MYSQL_DATABASE!,
  };
}

/**
 * `LEGACY_TIMEZONE` (default `Europe/Lisbon`, confirmed by the delegation —
 * plan §10 Q8) is an **application-level** concern read by
 * `transform/chronology.ts` to convert a legacy wall-clock `DATE`+`TIME` pair
 * to UTC. It is unrelated to the pool's own `timezone` option below, which
 * only affects how mysql2 reads back `TIMESTAMP` columns (there is exactly
 * one in the tables this loader touches: `alteracoes_escala.time`) — those
 * are stored in UTC by MySQL itself, and the dump was taken with
 * `TIME_ZONE='+00:00'`, so the pool is pinned to `+00:00` rather than left to
 * whatever zone the host running the loader happens to be in.
 */
export function legacyTimezone(env: NodeJS.ProcessEnv = process.env): string {
  return env.LEGACY_TIMEZONE ?? DEFAULT_LEGACY_TIMEZONE;
}

/**
 * `dateStrings: true` is load-bearing: without it, mysql2 returns `DATE`/
 * `TIME`/`DATETIME` columns as JS `Date` objects converted through the
 * *Node process's* local timezone, silently corrupting a value that is
 * actually a naive wall-clock stamp with no zone of its own. Every legacy
 * `DATE`/`TIME`/`DATETIME` column reaches `source/row-types.ts` as the exact
 * string MySQL stored, and `transform/chronology.ts` is the only place that
 * ever attaches a timezone to one.
 */
export function createLegacyPool(config: LegacyConnectionConfig): Pool {
  return createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    dateStrings: true,
    timezone: '+00:00',
    // The Portuguese table/column names throughout this schema need this;
    // the dump itself is `utf8mb4`/`utf8mb3` depending on table.
    charset: 'utf8mb4',
    connectionLimit: 5,
  });
}
