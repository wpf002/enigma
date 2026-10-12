// AACT snapshot sync + normalization pipeline entrypoint.
//   pnpm ingest <command> [--snapshot <id|version>] [--limit <n>]
import { getDb } from '@enigma/db';
import { createLogger, loadConfig } from '@enigma/shared';
import { buildSubset } from './aact/subset.js';
import { resolveSnapshotId } from './context.js';
import { runAuditSample } from './steps/auditSample.js';
import { runContradict } from './steps/contradict.js';
import { runControversyEval } from './steps/controversyEval.js';
import { runGate } from './steps/gate.js';
import { runGateEval } from './steps/gateEval.js';
import { runHarmonize } from './steps/harmonize.js';
import { runNormalize } from './steps/normalize.js';
import { runSnapshot } from './steps/snapshot.js';

const log = createLogger('ingest');

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const commands: Record<string, () => Promise<void>> = {
  'aact-subset': async () => {
    const limit = flag('limit');
    await buildSubset(loadConfig(), limit ? { limit: Number(limit) } : {});
  },
  snapshot: async () => {
    await runSnapshot(loadConfig());
  },
  normalize: async () => {
    await runNormalize(loadConfig(), await resolveSnapshotId(flag('snapshot')));
  },
  harmonize: async () => {
    await runHarmonize(loadConfig(), await resolveSnapshotId(flag('snapshot')));
  },
  gate: async () => {
    await runGate(loadConfig(), await resolveSnapshotId(flag('snapshot')));
  },
  contradict: async () => {
    await runContradict(loadConfig(), await resolveSnapshotId(flag('snapshot')));
  },
  'controversy-eval': async () => {
    await runControversyEval(await resolveSnapshotId(flag('snapshot')));
  },
  'gate-eval': async () => {
    await runGateEval(await resolveSnapshotId(flag('snapshot')));
  },
  'audit-sample': async () => {
    await runAuditSample(await resolveSnapshotId(flag('snapshot')));
  },
};

/** Derived layers in dependency order. Each step clears and rebuilds its own output. */
const PIPELINE = ['normalize', 'harmonize', 'gate', 'contradict'];

commands.pipeline = async () => {
  for (const step of PIPELINE) {
    log.info(`pipeline: ${step}`);
    await commands[step]!();
  }
};

async function main() {
  const name = process.argv[2] ?? '';
  const command = commands[name];
  if (!command) {
    console.error(`usage: pnpm ingest <${Object.keys(commands).join('|')}>`);
    process.exit(2);
  }
  const started = Date.now();
  await command();
  log.info(`${name} finished`, { seconds: Math.round((Date.now() - started) / 1000) });
}

main()
  .catch((err) => {
    log.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exitCode = 1;
  })
  .finally(() => getDb().$disconnect());
