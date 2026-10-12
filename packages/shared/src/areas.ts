/** A therapeutic area bounds the corpus. v1 ships one (ENIGMA_ROADMAP.md §9). */
export interface TherapeuticArea {
  id: string;
  label: string;
  /** ClinicalTrials.gov `query.cond` expression, used by the API subset loader. */
  conditionQuery: string;
  /** Lowercased MeSH condition terms, matched against ctgov.browse_conditions. */
  meshTerms: string[];
  /** Lowercased substrings matched against ctgov.conditions.downcase_name. */
  conditionPatterns: string[];
  /** Trials pulled in by NCT ID even when their condition tagging misses the query. */
  extraNctIds: string[];
}

export const AREAS: Record<string, TherapeuticArea> = {
  't2d-cv': {
    id: 't2d-cv',
    label: 'Type 2 diabetes — cardiovascular outcomes',
    conditionQuery: 'type 2 diabetes',
    meshTerms: ['diabetes mellitus, type 2'],
    conditionPatterns: ['type 2 diabet', 'type2 diabet', 'type2diabet', 'type ii diabet', 'diabetes mellitus, type 2', 't2dm'],
    // Cardiovascular outcome trials. IDs checked against the registry on 2026-10-11.
    extraNctIds: [
      'NCT01131676', // EMPA-REG OUTCOME
      'NCT01032629', // CANVAS
      'NCT01989754', // CANVAS-R
      'NCT01730534', // DECLARE-TIMI 58
      'NCT01986881', // VERTIS CV
      'NCT02065791', // CREDENCE
      'NCT01179048', // LEADER
      'NCT01720446', // SUSTAIN-6
      'NCT01144338', // EXSCEL
      'NCT01147250', // ELIXA
      'NCT02465515', // Harmony Outcomes
      'NCT01394952', // REWIND
      'NCT02692716', // PIONEER 6
      'NCT01107886', // SAVOR-TIMI 53
      'NCT00968708', // EXAMINE
      'NCT00790205', // TECOS
      'NCT01897532', // CARMELINA
      'NCT01243424', // CAROLINA
      'NCT00379769', // RECORD
      'NCT00069784', // ORIGIN
      'NCT01959529', // DEVOTE
      'NCT03496298', // AMPLITUDE-O
      'NCT03315143', // SCORED
      'NCT03521934', // SOLOIST-WHF
      'NCT00000620', // ACCORD
      'NCT00006305', // BARI 2D
    ],
  },
};

export function getArea(id: string): TherapeuticArea {
  const area = AREAS[id];
  if (!area) throw new Error(`unknown therapeutic area "${id}". Known: ${Object.keys(AREAS).join(', ')}`);
  return area;
}
