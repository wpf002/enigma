// Intervention dictionary for the v1 therapeutic area: canonical agents, their
// drug class, and the names they appear under in ClinicalTrials.gov arm titles.

export type AgentClass =
  | 'SGLT2I' | 'GLP1RA' | 'GIP_GLP1' | 'DPP4I' | 'TZD' | 'SU' | 'BIGUANIDE' | 'INSULIN_BASAL'
  | 'INSULIN_PRANDIAL' | 'INSULIN_PREMIX' | 'INSULIN' | 'AGI' | 'GLINIDE' | 'OTHER';

export const AGENT_CLASS_LABEL: Record<AgentClass, string> = {
  SGLT2I: 'SGLT2 inhibitor',
  GLP1RA: 'GLP-1 receptor agonist',
  GIP_GLP1: 'GIP/GLP-1 receptor agonist',
  DPP4I: 'DPP-4 inhibitor',
  TZD: 'Thiazolidinedione',
  SU: 'Sulfonylurea',
  BIGUANIDE: 'Biguanide',
  INSULIN_BASAL: 'Basal insulin',
  INSULIN_PRANDIAL: 'Prandial insulin',
  INSULIN_PREMIX: 'Premixed insulin',
  INSULIN: 'Insulin (unspecified)',
  AGI: 'Alpha-glucosidase inhibitor',
  GLINIDE: 'Meglitinide',
  OTHER: 'Other',
};

export interface Agent {
  id: string;
  label: string;
  class: AgentClass;
  /** Lowercase names: generic, brand, sponsor code. */
  aliases: string[];
  /** Unit doses are normalized to. */
  unit: 'mg' | 'mcg' | 'U';
}

const A = (id: string, label: string, cls: AgentClass, aliases: string[], unit: Agent['unit'] = 'mg'): Agent => ({
  id, label, class: cls, aliases: [label.toLowerCase(), ...aliases], unit,
});

export const AGENTS: Agent[] = [
  A('empagliflozin', 'Empagliflozin', 'SGLT2I', ['bi 10773', 'bi10773', 'jardiance', 'empa']),
  A('dapagliflozin', 'Dapagliflozin', 'SGLT2I', ['bms-512148', 'bms 512148', 'farxiga', 'forxiga', 'dapa']),
  A('canagliflozin', 'Canagliflozin', 'SGLT2I', ['jnj-28431754', 'jnj 28431754', 'ta-7284', 'invokana', 'cana']),
  A('ertugliflozin', 'Ertugliflozin', 'SGLT2I', ['mk-8835', 'mk8835', 'pf-04971729', 'steglatro']),
  A('sotagliflozin', 'Sotagliflozin', 'SGLT2I', ['lx4211', 'sar439954', 'zynquista']),
  A('ipragliflozin', 'Ipragliflozin', 'SGLT2I', ['asp1941']),
  A('luseogliflozin', 'Luseogliflozin', 'SGLT2I', ['ts-071']),
  A('tofogliflozin', 'Tofogliflozin', 'SGLT2I', ['csg452']),
  A('bexagliflozin', 'Bexagliflozin', 'SGLT2I', ['egt1442', 'egt0001442']),

  A('liraglutide', 'Liraglutide', 'GLP1RA', ['nn2211', 'victoza', 'lira']),
  A('semaglutide-oral', 'Semaglutide (oral)', 'GLP1RA', ['oral semaglutide', 'semaglutide oral', 'nn9924', 'rybelsus', 'semaglutide tablet']),
  A('semaglutide-sc', 'Semaglutide (s.c.)', 'GLP1RA', ['semaglutide', 'nn9535', 'ozempic', 'sema']),
  A('exenatide-qw', 'Exenatide once weekly', 'GLP1RA', ['exenatide once weekly', 'exenatide qw', 'exenatide lar', 'exenatide extended release', 'exenatide er', 'bydureon', 'ly2148568 once weekly', 'eqw']),
  A('exenatide-bid', 'Exenatide twice daily', 'GLP1RA', ['exenatide', 'ac2993', 'byetta', 'ly2148568']),
  A('dulaglutide', 'Dulaglutide', 'GLP1RA', ['ly2189265', 'trulicity', 'dula']),
  A('albiglutide', 'Albiglutide', 'GLP1RA', ['gsk716155', 'tanzeum', 'eperzan']),
  A('lixisenatide', 'Lixisenatide', 'GLP1RA', ['ave0010', 'lyxumia', 'adlyxin', 'lixi']),
  A('efpeglenatide', 'Efpeglenatide', 'GLP1RA', ['sar439977', 'hm11260c']),
  A('taspoglutide', 'Taspoglutide', 'GLP1RA', ['ro5073031', 'bim51077']),
  A('tirzepatide', 'Tirzepatide', 'GIP_GLP1', ['ly3298176', 'mounjaro']),

  A('sitagliptin', 'Sitagliptin', 'DPP4I', ['mk-0431', 'mk0431', 'januvia', 'sita']),
  A('saxagliptin', 'Saxagliptin', 'DPP4I', ['bms-477118', 'bms 477118', 'onglyza', 'saxa']),
  A('linagliptin', 'Linagliptin', 'DPP4I', ['bi 1356', 'bi1356', 'tradjenta', 'trajenta', 'lina']),
  A('alogliptin', 'Alogliptin', 'DPP4I', ['syr-322', 'syr322', 'nesina']),
  A('vildagliptin', 'Vildagliptin', 'DPP4I', ['laf237', 'laf 237', 'galvus', 'vilda']),
  A('omarigliptin', 'Omarigliptin', 'DPP4I', ['mk-3102', 'mk3102']),
  A('teneligliptin', 'Teneligliptin', 'DPP4I', ['mp-513']),
  A('trelagliptin', 'Trelagliptin', 'DPP4I', ['syr-472']),
  A('gemigliptin', 'Gemigliptin', 'DPP4I', ['lc15-0444']),

  A('pioglitazone', 'Pioglitazone', 'TZD', ['actos', 'ad-4833', 'pio']),
  A('rosiglitazone', 'Rosiglitazone', 'TZD', ['avandia', 'brl-49653', 'brl49653', 'rsg']),

  A('glimepiride', 'Glimepiride', 'SU', ['amaryl']),
  A('glipizide', 'Glipizide', 'SU', ['glucotrol']),
  A('glyburide', 'Glyburide', 'SU', ['glibenclamide', 'diabeta', 'micronase']),
  A('gliclazide', 'Gliclazide', 'SU', ['diamicron']),
  A('sulfonylurea', 'Sulfonylurea (unspecified)', 'SU', ['sulfonylurea', 'sulphonylurea']),

  A('metformin', 'Metformin', 'BIGUANIDE', ['glucophage', 'met xr', 'metformin xr', 'metformin ir', 'metformin hydrochloride', 'met']),

  A('insulin-glargine', 'Insulin glargine', 'INSULIN_BASAL', ['glargine', 'hoe901', 'hoe 901', 'lantus', 'toujeo', 'basaglar', 'ly2963016', 'gla-300', 'gla-100', 'iglar']),
  A('insulin-detemir', 'Insulin detemir', 'INSULIN_BASAL', ['detemir', 'nn304', 'levemir']),
  A('insulin-degludec', 'Insulin degludec', 'INSULIN_BASAL', ['degludec', 'nn1250', 'tresiba', 'ideg']),
  A('insulin-icodec', 'Insulin icodec', 'INSULIN_BASAL', ['icodec', 'nn1436']),
  A('insulin-peglispro', 'Basal insulin peglispro', 'INSULIN_BASAL', ['peglispro', 'ly2605541', 'bil']),
  A('insulin-nph', 'NPH insulin', 'INSULIN_BASAL', ['nph', 'isophane', 'humulin n', 'insulatard']),
  A('insulin-aspart', 'Insulin aspart', 'INSULIN_PRANDIAL', ['aspart', 'novolog', 'novorapid', 'fiasp', 'iasp']),
  A('insulin-lispro', 'Insulin lispro', 'INSULIN_PRANDIAL', ['lispro', 'humalog', 'ly275585']),
  A('insulin-glulisine', 'Insulin glulisine', 'INSULIN_PRANDIAL', ['glulisine', 'apidra']),
  A('insulin-inhaled', 'Inhaled insulin', 'INSULIN_PRANDIAL', ['technosphere insulin', 'inhaled insulin', 'afrezza', 'exubera']),
  A('insulin', 'Insulin (unspecified)', 'INSULIN', ['insulin'], 'U'),

  A('acarbose', 'Acarbose', 'AGI', ['glucobay', 'precose']),
  A('voglibose', 'Voglibose', 'AGI', []),
  A('miglitol', 'Miglitol', 'AGI', []),
  A('repaglinide', 'Repaglinide', 'GLINIDE', ['prandin']),
  A('nateglinide', 'Nateglinide', 'GLINIDE', ['starlix']),
  A('colesevelam', 'Colesevelam', 'OTHER', ['welchol']),
  A('bromocriptine', 'Bromocriptine', 'OTHER', ['cycloset']),
  A('aleglitazar', 'Aleglitazar', 'OTHER', ['ro0728804']),
  A('fasiglifam', 'Fasiglifam', 'OTHER', ['tak-875']),
];

for (const agent of AGENTS) {
  if (agent.class.startsWith('INSULIN')) agent.unit = 'U';
  if (['GLP1RA'].includes(agent.class) && ['exenatide-bid', 'lixisenatide'].includes(agent.id)) agent.unit = 'mcg';
}

export const AGENT_BY_ID = new Map(AGENTS.map((a) => [a.id, a]));

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Aliases sorted longest first so "oral semaglutide" wins over "semaglutide". */
const ALIAS_INDEX: { agent: Agent; alias: string; pattern: RegExp }[] = AGENTS.flatMap((agent) =>
  // Not preceded or followed by a letter. A digit may follow or precede: "Lina5Pio15", "Sita100".
  agent.aliases.map((alias) => ({ agent, alias, pattern: new RegExp(`(?<![a-z])${escape(alias)}(?![a-z])`, 'g') })),
).sort((x, y) => y.alias.length - x.alias.length);

export interface AgentHit {
  agent: Agent;
  alias: string;
  index: number;
}

/**
 * Agents named in a piece of arm text. Each character span is claimed by one alias only.
 * `strict` drops aliases shorter than five characters ("met", "pio"), which are safe in
 * arm titles but collide with ordinary words in free-text descriptions.
 */
export function findAgents(text: string | null | undefined, strict = false): AgentHit[] {
  if (!text) return [];
  const s = text.toLowerCase();
  const claimed: [number, number][] = [];
  const hits = new Map<string, AgentHit>();
  for (const { agent, alias, pattern } of ALIAS_INDEX) {
    if (strict && alias.length < 5) continue;
    pattern.lastIndex = 0;
    for (const m of s.matchAll(pattern)) {
      const start = m.index;
      const end = start + alias.length;
      if (claimed.some(([a, b]) => start < b && end > a)) continue;
      claimed.push([start, end]);
      if (!hits.has(agent.id)) hits.set(agent.id, { agent, alias, index: start });
    }
  }
  let out = [...hits.values()];
  // Aliases under five characters ("met", "pio", "sita") are abbreviations. They only count next to
  // another signal that the text is a drug list: a full drug name, a placebo, or a dose glued on.
  const anchored = out.some((h) => h.alias.length >= 5) || out.length >= 2 || /placebo|pbo/.test(s);
  out = out.filter((h) => h.alias.length >= 5 || anchored || /^\s?\d/.test(s.slice(h.index + h.alias.length)));
  // "insulin glargine" is one agent. Drop the unspecified-insulin hit when a specific insulin is present.
  const specific = out.some((h) => h.agent.class.startsWith('INSULIN_'));
  return out.filter((h) => !(specific && h.agent.id === 'insulin')).sort((a, b) => a.index - b.index);
}

/** Words that appear in arm titles without naming an intervention. */
const NEUTRAL = new Set(`a an and or the of to in on at by for with without plus then per vs versus from as is than
  placebo pbo sham vehicle dummy control controls comparator reference active experimental test treatment treatments
  treated group groups arm arms cohort cohorts part period sequence stage phase study main core extension overall total
  all pooled combined dose doses dosing low lower high higher medium mid middle fixed flexible titrated titration
  escalation maintenance initial starting target once twice thrice three times daily weekly monthly day days week weeks
  month months year years hour hours qd bid tid qid qw od ow biw prn am pm morning evening bedtime night meal meals
  mealtime premeal fasting fasted fed before after breakfast lunch dinner mg mcg ug kg ml iu unit units tablet tablets
  capsule capsules pill oral orally injection injections injected subcutaneous subcutaneously sc iv intravenous infusion
  inhaled er xr ir sr xl release extended immediate modified formulation solution pen vial device pump syringe prefilled
  therapy monotherapy combination add addon background stable existing current standard care usual conventional
  intensive routine diet exercise lifestyle drug drugs medication medications agent agents antidiabetic oad oads oha
  naive naïve participants participant patients patient subjects subject adults healthy volunteers japanese chinese
  korean asian t2d t2dm type diabetes mellitus only alone open label double blind randomized randomised matching matched
  first second third one two i ii iii iv step level arm1 arm2 not no non any other both either each who were was are
  receiving received switch switched continued continuation initiation insulin basal bolus prandial regimen algorithm
  based intervention interventions program programme`.split(/\s+/));

/** Pseudo-agent that is a sponsor code ("?bi456906"). Codes identify one compound, so trials can be matched on them. */
export const isCodeAgent = (id: string): boolean => /^\?[a-z]{2,6}\d{2,}[a-z]?$/.test(id);

/**
 * Key two records must share to be compared on intervention. Null when the arm contains something
 * that is neither a known agent nor a sponsor code: a leftover word is not an identity.
 */
export function interventionKey(agents: readonly string[]): string | null {
  if (agents.length === 0) return null;
  if (agents.some((id) => id.startsWith('?') && !isCodeAgent(id))) return null;
  return [...agents].sort().join('+');
}

/**
 * Tokens in an arm title that are not a known agent, a dose, or a neutral word. A leftover token means the
 * arm contains something the dictionary does not cover: an investigational code, a drug of another class,
 * a device, a behavioral program. Such arms get a pseudo-agent, so they are never matched to a known agent's block.
 */
export function unknownTokens(title: string, hits: readonly AgentHit[]): string[] {
  let s = ` ${title.toLowerCase()} `;
  for (const hit of [...hits].sort((a, b) => b.index - a.index)) {
    s = `${s.slice(0, hit.index + 1)} ${s.slice(hit.index + 1 + hit.alias.length)}`;
  }
  // sponsor codes: "bi 456906", "pf-04991532", "medi0382", "ent-03s"
  const codes = [...s.matchAll(/(?<![a-z0-9])([a-z]{2,6})[- ]?(\d{3,}[a-z]?|\d{2}[a-z])(?![a-z0-9])/g)].map((m) => `${m[1]}${m[2]}`);
  s = s.replace(/(?<![a-z0-9])([a-z]{2,6})[- ]?(\d{3,}[a-z]?|\d{2}[a-z])(?![a-z0-9])/g, ' ');
  const words = s
    .replace(/\d+(\.\d+)?\s*(mg|mcg|µg|μg|ug|g|kg|ml|iu|u|units?|%)?(\s*\/\s*(day|d|kg|week|ml|dl))?/g, ' ')
    .split(/[^a-zà-ÿ]+/)
    .filter((w) => w.length >= 4 && !NEUTRAL.has(w));
  return [...new Set([...codes, ...words])];
}
