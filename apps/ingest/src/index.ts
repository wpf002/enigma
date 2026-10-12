// AACT snapshot sync + normalization pipeline entrypoint.
//   pnpm ingest <command> [--snapshot <id|version>] [--limit <n>]
import { getDb } from '@enigma/db';
import { createLogger, loadConfig } from '@enigma/shared';
import { buildSubset } from './aact/subset.js';
import { resolveSnapshotId } from './context.js';
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
