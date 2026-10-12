import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.string().min(1),
  AACT_DATABASE_URL: z.string().min(1),
  ENGINE_URL: z.string().default('http://localhost:8100'),
  API_PORT: z.coerce.number().int().default(4000),
  AACT_SNAPSHOT_VERSION: z.string().default(''),
  INGEST_BATCH_SIZE: z.coerce.number().int().positive().default(1000),
  THERAPEUTIC_AREA: z.string().default('t2d-cv'),
  COMPARABILITY_GATE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),
  DOSE_EQUIVALENCE_BAND: z.coerce.number().min(0).max(1).default(0.25),
  TIMEPOINT_OVERLAP_MIN_DAYS: z.coerce.number().int().nonnegative().default(14),
  HETEROGENEITY_I2_THRESHOLD: z.coerce.number().min(0).max(1).default(0.6),
});

export type EnigmaConfig = z.infer<typeof schema>;

/** Engine tuning constants. Sent with every engine request so the values land in the Factor chain. */
export interface GateTuning {
  gateThreshold: number;
  doseEquivalenceBand: number;
  timepointOverlapMinDays: number;
  i2Threshold: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): EnigmaConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ConfigError(`invalid environment: ${missing}`);
  }
  return parsed.data;
}

export function gateTuning(config: EnigmaConfig): GateTuning {
  return {
    gateThreshold: config.COMPARABILITY_GATE_THRESHOLD,
    doseEquivalenceBand: config.DOSE_EQUIVALENCE_BAND,
    timepointOverlapMinDays: config.TIMEPOINT_OVERLAP_MIN_DAYS,
    i2Threshold: config.HETEROGENEITY_I2_THRESHOLD,
  };
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}
