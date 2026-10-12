import { EngineError, type EnigmaConfig } from '@enigma/shared';

/** POSTs to the Python engine. All statistics are computed there (ENIGMA_ROADMAP.md §2.8). */
export async function callEngine<T>(config: EnigmaConfig, path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.ENGINE_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new EngineError(`engine unreachable at ${config.ENGINE_URL}. Start it with \`pnpm engine:dev\`.`, { path, cause: String(err) });
  }
  if (!res.ok) {
    throw new EngineError(`engine ${path} returned ${res.status}`, { path, body: (await res.text()).slice(0, 2000) });
  }
  return (await res.json()) as T;
}

export async function engineRuleVersion(config: EnigmaConfig): Promise<string> {
  try {
    const res = await fetch(`${config.ENGINE_URL}/health`);
    const json = (await res.json()) as { ruleVersion?: string };
    if (!res.ok || !json.ruleVersion) throw new Error(`status ${res.status}`);
    return json.ruleVersion;
  } catch (err) {
    throw new EngineError(`engine unreachable at ${config.ENGINE_URL}. Start it with \`pnpm engine:dev\`.`, { cause: String(err) });
  }
}
