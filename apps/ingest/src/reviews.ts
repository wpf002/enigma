import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getDb } from '@enigma/db';

export interface ReviewFixture {
  id: string;
  citation: string;
  pmid: string | null;
  year: number;
  pooling: 'AGENT' | 'AGENT_CLASS';
  agentClasses: string[];
  agents: string[];
  endpointNodeIds: string[];
  includedNctIds: string[];
  excludedNctIds: string[];
  conclusion: string;
  reviewStatus: 'PENDING_HUMAN_REVIEW' | 'REVIEWED';
}

const DIR = fileURLToPath(new URL('../../../fixtures/reviews/', import.meta.url));

export async function loadReviews(): Promise<ReviewFixture[]> {
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.json')).sort();
  return Promise.all(files.map(async (f) => JSON.parse(await readFile(`${DIR}${f}`, 'utf8')) as ReviewFixture));
}

/** Mirrors fixtures/reviews into the ResolvedReview table so the API can serve them. */
export async function syncReviews(): Promise<ReviewFixture[]> {
  const db = getDb();
  const reviews = await loadReviews();
  await db.resolvedReview.deleteMany({});
  await db.resolvedReview.createMany({
    data: reviews.map((r) => ({
      id: r.id, citation: r.citation, pmid: r.pmid, year: r.year, endpointNodeIds: r.endpointNodeIds,
      agentClasses: r.agentClasses, agents: r.agents, nctIds: r.includedNctIds, excludedNctIds: r.excludedNctIds,
      pooling: r.pooling, conclusion: r.conclusion, reviewStatus: r.reviewStatus,
    })),
  });
  return reviews;
}
