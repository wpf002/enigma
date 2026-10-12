import { describe, expect, it } from 'vitest';
import {
  assignRoles, classifyArmData, classifyMeasure, classifyStopReason, directionHint, findAgents, profileArm, type DesignGroup, type RoleAssignment,
} from './index.js';

const design: DesignGroup[] = [
  { title: 'Sitagliptin 100 mg', groupType: 'EXPERIMENTAL', description: null },
  { title: 'Glimepiride', groupType: 'ACTIVE_COMPARATOR', description: null },
  { title: 'Placebo', groupType: 'PLACEBO_COMPARATOR', description: null },
];
const arm = (code: string, title: string, description: string | null = null) => profileArm({ code, title, description }, design);
const ok = (r: ReturnType<typeof assignRoles>): RoleAssignment => {
  if ('reason' in r) throw new Error(r.detail);
  return r;
};

describe('findAgents', () => {
  it('prefers the longest alias and resolves sponsor codes', () => {
    expect(findAgents('Oral semaglutide 14 mg').map((h) => h.agent.id)).toEqual(['semaglutide-oral']);
    expect(findAgents('BI 10773 low dose').map((h) => h.agent.id)).toEqual(['empagliflozin']);
    expect(findAgents('Insulin glargine + metformin').map((h) => h.agent.id)).toEqual(['insulin-glargine', 'metformin']);
  });
  it('ignores short aliases in strict mode', () => {
    expect(findAgents('participants who met the criteria', true)).toEqual([]);
  });
});

describe('assignRoles', () => {
  it('treats the placebo arm as comparator and removes shared background', () => {
    const r = ok(assignRoles(arm('OG000', 'Placebo + Metformin'), arm('OG001', 'Sitagliptin 100 mg + Metformin')));
    expect(r.experimental.code).toBe('OG001');
    expect(r.agents).toEqual(['sitagliptin']);
    expect(r.background).toEqual(['metformin']);
    expect(r.comparatorClass).toBe('PLACEBO');
    expect(r.dose?.daily).toBe(100);
  });
  it('does not read the drug named in "placebo matching X" as an agent of the placebo arm', () => {
    const r = ok(assignRoles(arm('OG000', 'Placebo', 'Placebo matching empagliflozin 10 mg'), arm('OG001', 'Empagliflozin 10 mg')));
    expect(r.comparator.agents).toEqual([]);
    expect(r.agents).toEqual(['empagliflozin']);
  });
  it('uses the registered arm type for head-to-head comparisons', () => {
    const r = ok(assignRoles(arm('OG000', 'Glimepiride'), arm('OG001', 'Sitagliptin 100 mg')));
    expect(r.experimental.code).toBe('OG001');
    expect(r.comparatorClass).toBe('ACTIVE');
    expect(r.comparatorAgents).toEqual(['glimepiride']);
  });
  it('orders a dose comparison with the lower dose as comparator', () => {
    const r = ok(assignRoles(arm('OG000', 'Empagliflozin 25 mg'), arm('OG001', 'Empagliflozin 10 mg')));
    expect(r.comparatorClass).toBe('DOSE_COMPARISON');
    expect(r.experimental.code).toBe('OG000');
  });
  it('normalizes weekly and twice-daily doses to a daily amount', () => {
    const weekly = ok(assignRoles(arm('OG000', 'Placebo'), arm('OG001', 'Dulaglutide 1.5 mg once weekly')));
    expect(weekly.dose?.daily).toBeCloseTo(1.5 / 7);
    const bid = ok(assignRoles(arm('OG000', 'Placebo'), arm('OG001', 'Exenatide 10 mcg BID')));
    expect(bid.dose).toMatchObject({ daily: 20, unit: 'mcg' });
  });
  it('orients an unregistered head-to-head by agent id, the same way from either side', () => {
    const none: DesignGroup[] = [];
    const lira = profileArm({ code: 'a', title: 'Liraglutide', description: null }, none);
    const sita = profileArm({ code: 'b', title: 'Sitagliptin', description: null }, none);
    expect(ok(assignRoles(lira, sita)).agents).toEqual(['liraglutide']);
    expect(ok(assignRoles(sita, lira)).agents).toEqual(['liraglutide']);
  });
  it('refuses to order two arms with no agent and no control', () => {
    const none: DesignGroup[] = [];
    const r = assignRoles(profileArm({ code: 'a', title: 'Structured testing', description: null }, none), profileArm({ code: 'b', title: 'Self-directed care', description: null }, none));
    expect('reason' in r && r.reason).toBe('ARM_ROLES_UNDETERMINED');
  });
});

describe('directionHint', () => {
  const placebo = arm('OG000', 'Placebo');
  const drug = arm('OG001', 'Empagliflozin 10 mg');
  it('reads the stated order', () => {
    expect(directionHint(['All Empagliflozin divided by Placebo'], drug, placebo)).toBe('EXPERIMENTAL_FIRST');
    expect(directionHint(['Placebo minus empagliflozin'], drug, placebo)).toBe('COMPARATOR_FIRST');
    expect(directionHint(['Adjusted for baseline HbA1c'], drug, placebo)).toBeNull();
  });
});

describe('classifyMeasure', () => {
  it('maps free-text estimate types', () => {
    expect(classifyMeasure('Hazard Ratio (HR)', 'TIME_TO_EVENT')).toMatchObject({ measure: 'HR', logScale: false });
    expect(classifyMeasure('Odds Ratio, log', 'BINARY')).toMatchObject({ measure: 'OR', logScale: true });
    expect(classifyMeasure('LS Mean Difference', 'CONTINUOUS')).toMatchObject({ measure: 'MD' });
    expect(classifyMeasure('Difference in percentage', 'BINARY')).toMatchObject({ measure: 'RD' });
    expect(classifyMeasure('Geometric mean ratio', 'CONTINUOUS')).toMatchObject({ reason: 'UNSUPPORTED_PARAM_TYPE' });
    expect(classifyMeasure('', 'CONTINUOUS')).toMatchObject({ reason: 'NO_PARAM_TYPE' });
  });
});

describe('classifyArmData', () => {
  it('reads both API and legacy AACT spellings', () => {
    expect(classifyArmData('LEAST_SQUARES_MEAN', 'Standard Error', 'percentage of HbA1c')).toMatchObject({ outcomeKind: 'CONTINUOUS', armParam: 'MEAN', armDispersion: 'SE' });
    expect(classifyArmData('Mean', '95% Confidence Interval', 'kg')).toMatchObject({ armDispersion: 'CI', armCiLevel: 0.95 });
    expect(classifyArmData('NUMBER', null, 'percentage of participants')).toMatchObject({ outcomeKind: 'BINARY', armParam: 'PERCENT' });
    expect(classifyArmData('Count of Participants', null, 'Participants')).toMatchObject({ outcomeKind: 'BINARY', armParam: 'COUNT' });
    expect(classifyArmData('MEDIAN', 'Full Range', 'kg').outcomeKind).toBe('UNKNOWN');
  });
});

describe('classifyStopReason', () => {
  it('keeps the reason a trial was terminated', () => {
    expect(classifyStopReason('TERMINATED', 'Stopped for futility at interim analysis')?.category).toBe('FUTILITY');
    expect(classifyStopReason('TERMINATED', 'Slow recruitment')?.category).toBe('ENROLLMENT');
    expect(classifyStopReason('TERMINATED', null)?.category).toBe('OTHER');
    expect(classifyStopReason('COMPLETED', null)).toBeNull();
  });
});
