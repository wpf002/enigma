import pg from 'pg';
import type { EnigmaConfig } from '@enigma/shared';

// AACT returns numeric and date columns. Keep dates as ISO strings and numerics
// as JS numbers so the raw payload hashes the same way on every run.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

export function aactPool(config: EnigmaConfig): pg.Pool {
  return new pg.Pool({ connectionString: config.AACT_DATABASE_URL, max: 4 });
}
