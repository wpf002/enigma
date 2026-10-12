import { AGENT_BY_ID, findAgents, unknownTokens, type Agent, type AgentClass, type AgentHit } from './agents.js';
import { parseDose, type Dose } from './dose.js';
import { defineRule } from './registry.js';

export type ComparatorClass = 'PLACEBO' | 'ACTIVE' | 'STANDARD_OF_CARE' | 'NO_TREATMENT' | 'DOSE_COMPARISON';

export const COMPARATOR_LABEL: Record<ComparatorClass, string> = {
  PLACEBO: 'Placebo',
  ACTIVE: 'Active Control',
  STANDARD_OF_CARE: 'Standard of Care',
  NO_TREATMENT: 'No Treatment',
  DOSE_COMPARISON: 'Dose Comparison',
};

/** A result group (ctgov.result_groups row) as posted. */
export interface ResultGroup {
  code: string;
  title: string;
  description: string | null;
}

/** A protocol arm (ctgov.design_groups row). */
export interface DesignGroup {
  title: string;
  groupType: string | null;
  description: string | null;
}

export interface ArmProfile {
  code: string;
  title: string;
  agents: Agent[];
  hits: AgentHit[];
  /** Leftover title tokens: an intervention the dictionary does not cover. Stored as "?token". */
  unknown: string[];
  placebo: boolean;
  /** The description says the arm received a placebo. Used to class a control arm, not to find one. */
  describedPlacebo: boolean;
  /** Title is a treatment sequence that includes placebo ("Placebo/Metformin"). Not a single-period arm. */
  sequence: boolean;
  /** Title names a non-drug control: usual care, standard treatment, waitlist. */
  control: boolean;
  /** group_type of the best-matching protocol arm. */
  designType: string | null;
  doses: Record<string, Dose>;
}

export interface RoleAssignment {
  experimental: ArmProfile;
  comparator: ArmProfile;
  /** Agents in the experimental arm that the comparator arm does not also receive. */
  agents: string[];
  agentClass: AgentClass | null;
  comparatorClass: ComparatorClass;
  comparatorAgents: string[];
  /** Agents both arms receive. */
  background: string[];
  dose: Dose | null;
  /** Dose of the lead agent in the comparator arm. Only meaningful for dose comparisons. */
  comparatorDose: Dose | null;
  rule: string;
}

export interface RoleFailure {
  reason: 'ARM_ROLES_UNDETERMINED';
  rule: string;
  detail: string;
}

const R = {
  control: defineRule('ARM_ROLE', 'arm_role.control_arm', 'One arm has an agent the other lacks and the other is placebo, standard care or untreated: that arm is the comparator.'),
  active: defineRule('ARM_ROLE', 'arm_role.active_comparator', 'Both arms have distinct agents: the arm registered as ACTIVE_COMPARATOR is the comparator.'),
  dose: defineRule('ARM_ROLE', 'arm_role.dose_comparison', 'Both arms have the same agent at different doses: the lower dose is the comparator.'),
  headToHead: defineRule('ARM_ROLE', 'arm_role.head_to_head_canonical', 'Both arms have distinct agents and neither is registered as the comparator: arms are ordered by agent id, so the same head-to-head comparison is oriented the same way in every trial.'),
  design: defineRule('ARM_ROLE', 'arm_role.design_type', 'No agent is recognized in either arm: the arm registered as EXPERIMENTAL is the experimental arm.'),
  none: defineRule('ARM_ROLE', 'arm_role.undetermined', 'The two arms cannot be ordered from their titles or registered arm types.'),
  sequence: defineRule('ARM_ROLE', 'arm_role.sequence_arm', 'An arm title is a treatment sequence that includes placebo. Its posted value mixes periods, so it is not paired.'),
  placeboMix: defineRule('ARM_ROLE', 'arm_role.placebo_with_extra_agent', 'The placebo arm carries an agent the other arm does not. The arms differ in more than the study drug, so they are not paired.'),
};

const PLACEBO = /\b(placebo|pbo|sham|vehicle|dummy)\b/;
const CONTROL_TITLE = /\b(control|usual care|standard care|standard of care|standard treatment|standard therapy|conventional|no intervention|no treatment|wait ?list|delayed intervention|observation)\b/;
const CONTROL_TYPES = new Set(['PLACEBO_COMPARATOR', 'SHAM_COMPARATOR', 'NO_INTERVENTION', 'ACTIVE_COMPARATOR']);

const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9. ]+/g, ' ').split(/\s+/).filter((t) => t.length > 1));

function overlap(a: string, b: string): number {
  const x = tokens(a);
  const y = tokens(b);
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared += 1;
  return shared / Math.min(x.size, y.size);
}

/** "Placebo matching empagliflozin" names a drug the arm does not receive. Strip those phrases. */
const stripPlaceboPhrases = (s: string) =>
  s.replace(/\b(placebo|dummy)\s+(to|for|of|matching|matched to|to match)\s+[^,.;()]+/gi, ' placebo ')
    .replace(/\bmatching\s+[a-z0-9 -]+?\s+placebo\b/gi, ' placebo ')
    .replace(/\b[a-z0-9-]+[- ]matching placebo\b/gi, ' placebo ');

export function profileArm(group: ResultGroup, designGroups: readonly DesignGroup[]): ArmProfile {
  const title = stripPlaceboPhrases(group.title);
  const description = group.description ? stripPlaceboPhrases(group.description) : null;
  const titlePlacebo = PLACEBO.test(title.toLowerCase());

  // Agents are read from the title only. Descriptions mention drugs the arm does not receive
  // (background therapy of other strata, prior treatment, matching placebos).
  const hits = findAgents(title);
  const titleUnknown = unknownTokens(title, hits);

  let designType: string | null = null;
  let best = 0.5;
  for (const dg of designGroups) {
    const score = dg.title.toLowerCase() === group.title.toLowerCase() ? 2 : overlap(dg.title, group.title);
    if (score > best) {
      best = score;
      designType = dg.groupType ? dg.groupType.toUpperCase().replace(/[^A-Z]+/g, '_') : null;
    }
  }

  const doses: Record<string, Dose> = {};
  for (const hit of hits) {
    const dose = parseDose(hit.agent, hit.alias, title, description);
    if (dose) doses[hit.agent.id] = dose;
  }
  const unknown = titlePlacebo && hits.length === 0 ? [] : titleUnknown.map((t) => `?${t}`);
  const lower = title.toLowerCase();
  return {
    code: group.code,
    title: group.title,
    agents: hits.map((h) => h.agent),
    hits,
    unknown,
    placebo: titlePlacebo || (hits.length === 0 && PLACEBO.test((description ?? '').toLowerCase())),
    describedPlacebo: PLACEBO.test((description ?? '').toLowerCase()),
    sequence: titlePlacebo && hits.length > 0 && /(placebo|pbo)\s*(\/|->|→|then|followed by|to)\s*[a-z]|[a-z0-9.)]\s*(\/|->|→|then|followed by)\s*(placebo|pbo)/.test(lower),
    control: hits.length === 0 && CONTROL_TITLE.test(lower),
    designType,
    doses,
  };
}

function controlClass(arm: ArmProfile): ComparatorClass {
  if (arm.placebo || arm.describedPlacebo || arm.designType === 'PLACEBO_COMPARATOR' || arm.designType === 'SHAM_COMPARATOR') return 'PLACEBO';
  if (arm.designType === 'NO_INTERVENTION') return 'NO_TREATMENT';
  return 'STANDARD_OF_CARE';
}

function primaryAgent(ids: string[]): Agent | null {
  return ids.length ? (AGENT_BY_ID.get(ids[0]!) ?? null) : null;
}

const idsOf = (arm: ArmProfile): string[] => [...arm.agents.map((a) => a.id), ...arm.unknown];

function build(experimental: ArmProfile, comparator: ArmProfile, comparatorClass: ComparatorClass, rule: string): RoleAssignment {
  const compIds = new Set(idsOf(comparator));
  const expIds = new Set(idsOf(experimental));
  const background = [...expIds].filter((id) => compIds.has(id)).sort();
  const dosed = comparatorClass === 'DOSE_COMPARISON';
  const agents = (dosed ? [...expIds] : [...expIds].filter((id) => !compIds.has(id))).sort();
  const comparatorAgents = (dosed ? [...compIds] : [...compIds].filter((id) => !expIds.has(id))).sort();
  const lead = primaryAgent(agents.filter((id) => !id.startsWith('?')));
  return {
    experimental,
    comparator,
    agents,
    agentClass: agents.some((id) => id.startsWith('?')) ? null : (lead?.class ?? null),
    comparatorClass,
    comparatorAgents,
    background: dosed ? [] : background,
    dose: lead ? (experimental.doses[lead.id] ?? null) : null,
    comparatorDose: lead && dosed ? (comparator.doses[lead.id] ?? null) : null,
    rule,
  };
}

/** Decides which of two result groups is the experimental arm and classifies the comparator. */
export function assignRoles(a: ArmProfile, b: ArmProfile): RoleAssignment | RoleFailure {
  if (a.sequence || b.sequence) {
    return { reason: 'ARM_ROLES_UNDETERMINED', rule: R.sequence, detail: `"${a.sequence ? a.title : b.title}" is a treatment sequence` };
  }
  const idsA = new Set(idsOf(a));
  const idsB = new Set(idsOf(b));
  const onlyA = [...idsA].filter((id) => !idsB.has(id));
  const onlyB = [...idsB].filter((id) => !idsA.has(id));

  if (onlyA.length > 0 && onlyB.length === 0) return build(a, b, controlClass(b), R.control);
  if (onlyB.length > 0 && onlyA.length === 0) return build(b, a, controlClass(a), R.control);

  if (onlyA.length > 0 && onlyB.length > 0) {
    if ((a.placebo && !b.placebo) || (b.placebo && !a.placebo)) {
      return { reason: 'ARM_ROLES_UNDETERMINED', rule: R.placeboMix, detail: `"${a.title}" and "${b.title}" differ in more than the study drug` };
    }
    const aActive = a.designType === 'ACTIVE_COMPARATOR';
    const bActive = b.designType === 'ACTIVE_COMPARATOR';
    if (bActive && !aActive) return build(a, b, 'ACTIVE', R.active);
    if (aActive && !bActive) return build(b, a, 'ACTIVE', R.active);
    // Canonical ordering needs a recognized agent on both sides, and neither arm registered as a
    // control or as "other": those are background arms of a stratified design, not a head-to-head.
    const headToHead = (t: string | null) => t === null || t === 'EXPERIMENTAL' || t === 'ACTIVE_COMPARATOR';
    if (!headToHead(a.designType) || !headToHead(b.designType)) {
      return { reason: 'ARM_ROLES_UNDETERMINED', rule: R.none, detail: `"${a.title}" and "${b.title}" are not registered as a head-to-head comparison` };
    }
    if (a.agents.length === 0 || b.agents.length === 0) {
      return { reason: 'ARM_ROLES_UNDETERMINED', rule: R.none, detail: `"${a.title}" and "${b.title}" cannot be ordered: one names no recognized agent` };
    }
    const keyA = onlyA.sort().join('+');
    const keyB = onlyB.sort().join('+');
    return keyA < keyB ? build(a, b, 'ACTIVE', R.headToHead) : build(b, a, 'ACTIVE', R.headToHead);
  }

  // same agents in both arms
  const known = [...idsA].filter((id) => !id.startsWith('?')).sort();
  if (known.length > 0) {
    const lead = known[0]!;
    const da = a.doses[lead]?.daily;
    const db = b.doses[lead]?.daily;
    if (da !== undefined && db !== undefined && da !== db) {
      return da > db ? build(a, b, 'DOSE_COMPARISON', R.dose) : build(b, a, 'DOSE_COMPARISON', R.dose);
    }
  }
  const aControl = a.placebo || a.control || CONTROL_TYPES.has(a.designType ?? '');
  const bControl = b.placebo || b.control || CONTROL_TYPES.has(b.designType ?? '');
  if (a.designType === 'EXPERIMENTAL' && bControl && b.designType !== 'EXPERIMENTAL') {
    return build(a, b, b.designType === 'ACTIVE_COMPARATOR' ? 'ACTIVE' : controlClass(b), R.design);
  }
  if (b.designType === 'EXPERIMENTAL' && aControl && a.designType !== 'EXPERIMENTAL') {
    return build(b, a, a.designType === 'ACTIVE_COMPARATOR' ? 'ACTIVE' : controlClass(a), R.design);
  }
  if (b.placebo && !a.placebo) return build(a, b, 'PLACEBO', R.design);
  if (a.placebo && !b.placebo) return build(b, a, 'PLACEBO', R.design);
  if (b.control && !a.control) return build(a, b, controlClass(b), R.control);
  if (a.control && !b.control) return build(b, a, controlClass(a), R.control);
  return { reason: 'ARM_ROLES_UNDETERMINED', rule: R.none, detail: `"${a.title}" and "${b.title}" cannot be ordered` };
}
