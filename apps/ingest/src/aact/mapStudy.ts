// Maps one ClinicalTrials.gov API v2 study document to AACT `ctgov` rows.
// Column names follow the AACT data dictionary so the raw loader reads the
// subset and a real AACT restore through the same code path.

type Json = Record<string, any>;
export type Row = Record<string, string | number | boolean | null>;

export interface IdAllocator {
  next(table: string): number;
}

export type AactRows = Record<string, Row[]>;

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/,/g, '').trim();
  if (s === '' || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const str = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));

/** "2010-07" -> "2010-07-01". AACT stores month-precision dates on the first of the month. */
const date = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  return null;
};

/** "<0.0001" -> modifier "<", value 0.0001. AACT splits the two. */
function splitPValue(raw: unknown): { modifier: string | null; value: number | null } {
  const s = str(raw);
  if (!s) return { modifier: null, value: null };
  const m = s.trim().match(/^([<>]=?|=)?\s*(.*)$/);
  return { modifier: m?.[1] ?? null, value: num(m?.[2]) };
}

export function mapStudy(doc: Json, ids: IdAllocator): AactRows {
  const rows: AactRows = {};
  const push = (table: string, row: Row) => (rows[table] ??= []).push(row);

  const p = doc.protocolSection ?? {};
  const r = doc.resultsSection ?? {};
  const derived = doc.derivedSection ?? {};
  const nct = p.identificationModule?.nctId as string;
  const status = p.statusModule ?? {};
  const design = p.designModule ?? {};
  const lead = p.sponsorCollaboratorsModule?.leadSponsor ?? {};

  push('studies', {
    nct_id: nct,
    brief_title: str(p.identificationModule?.briefTitle),
    official_title: str(p.identificationModule?.officialTitle),
    acronym: str(p.identificationModule?.acronym),
    overall_status: str(status.overallStatus),
    study_type: str(design.studyType),
    phase: design.phases?.length ? design.phases.join('/') : null,
    enrollment: num(design.enrollmentInfo?.count),
    enrollment_type: str(design.enrollmentInfo?.type),
    start_date: date(status.startDateStruct?.date),
    primary_completion_date: date(status.primaryCompletionDateStruct?.date),
    completion_date: date(status.completionDateStruct?.date),
    results_first_submitted_date: date(status.resultsFirstSubmitDate),
    results_first_posted_date: date(status.resultsFirstPostDateStruct?.date),
    last_update_submitted_date: date(status.lastUpdateSubmitDate),
    why_stopped: str(status.whyStopped),
    source: str(lead.name),
    source_class: str(lead.class),
  });

  push('designs', {
    id: ids.next('designs'),
    nct_id: nct,
    allocation: str(design.designInfo?.allocation),
    intervention_model: str(design.designInfo?.interventionModel),
    primary_purpose: str(design.designInfo?.primaryPurpose),
    masking: str(design.designInfo?.maskingInfo?.masking),
  });

  const elig = p.eligibilityModule ?? {};
  const ages: string[] = elig.stdAges ?? [];
  push('eligibilities', {
    id: ids.next('eligibilities'),
    nct_id: nct,
    gender: str(elig.sex),
    minimum_age: str(elig.minimumAge),
    maximum_age: str(elig.maximumAge),
    healthy_volunteers: elig.healthyVolunteers === undefined ? null : String(elig.healthyVolunteers),
    criteria: str(elig.eligibilityCriteria),
    adult: ages.includes('ADULT'),
    child: ages.includes('CHILD'),
    older_adult: ages.includes('OLDER_ADULT'),
  });

  for (const name of p.conditionsModule?.conditions ?? []) {
    push('conditions', { id: ids.next('conditions'), nct_id: nct, name, downcase_name: String(name).toLowerCase() });
  }
  const browse = (table: string, mod: Json | undefined) => {
    for (const [key, type] of [['meshes', 'mesh-list'], ['ancestors', 'mesh-ancestor']] as const) {
      for (const m of mod?.[key] ?? []) {
        push(table, {
          id: ids.next(table),
          nct_id: nct,
          mesh_term: m.term,
          downcase_mesh_term: String(m.term).toLowerCase(),
          mesh_type: type,
        });
      }
    }
  };
  browse('browse_conditions', derived.conditionBrowseModule);
  browse('browse_interventions', derived.interventionBrowseModule);

  if (lead.name) {
    push('sponsors', {
      id: ids.next('sponsors'),
      nct_id: nct,
      agency_class: str(lead.class),
      lead_or_collaborator: 'lead',
      name: str(lead.name),
    });
  }
  for (const c of p.sponsorCollaboratorsModule?.collaborators ?? []) {
    push('sponsors', {
      id: ids.next('sponsors'),
      nct_id: nct,
      agency_class: str(c.class),
      lead_or_collaborator: 'collaborator',
      name: str(c.name),
    });
  }

  // arms and interventions
  const arms = p.armsInterventionsModule ?? {};
  const groupIdByLabel = new Map<string, number>();
  for (const g of arms.armGroups ?? []) {
    const id = ids.next('design_groups');
    groupIdByLabel.set(g.label, id);
    push('design_groups', {
      id,
      nct_id: nct,
      group_type: str(g.type),
      title: str(g.label),
      description: str(g.description),
    });
  }
  for (const iv of arms.interventions ?? []) {
    const id = ids.next('interventions');
    push('interventions', {
      id,
      nct_id: nct,
      intervention_type: str(iv.type),
      name: str(iv.name),
      description: str(iv.description),
    });
    for (const other of iv.otherNames ?? []) {
      push('intervention_other_names', {
        id: ids.next('intervention_other_names'),
        nct_id: nct,
        intervention_id: id,
        name: str(other),
      });
    }
    for (const label of iv.armGroupLabels ?? []) {
      const groupId = groupIdByLabel.get(label);
      if (groupId === undefined) continue;
      push('design_group_interventions', {
        id: ids.next('design_group_interventions'),
        nct_id: nct,
        design_group_id: groupId,
        intervention_id: id,
      });
    }
  }

  // baseline
  const base = r.baselineCharacteristicsModule;
  if (base) {
    const bg = new Map<string, number>();
    for (const g of base.groups ?? []) {
      const id = ids.next('result_groups');
      bg.set(g.id, id);
      push('result_groups', {
        id,
        nct_id: nct,
        ctgov_group_code: g.id,
        result_type: 'Baseline',
        title: str(g.title),
        description: str(g.description),
      });
    }
    for (const d of base.denoms ?? []) {
      for (const c of d.counts ?? []) {
        push('baseline_counts', {
          id: ids.next('baseline_counts'),
          nct_id: nct,
          result_group_id: bg.get(c.groupId) ?? null,
          ctgov_group_code: c.groupId,
          units: str(d.units),
          scope: 'overall',
          count: num(c.value),
        });
      }
    }
    for (const m of base.measures ?? []) {
      for (const cls of m.classes ?? []) {
        for (const cat of cls.categories ?? []) {
          for (const x of cat.measurements ?? []) {
            push('baseline_measurements', {
              id: ids.next('baseline_measurements'),
              nct_id: nct,
              result_group_id: bg.get(x.groupId) ?? null,
              ctgov_group_code: x.groupId,
              classification: str(cls.title),
              category: str(cat.title),
              title: str(m.title),
              description: str(m.description),
              units: str(m.unitOfMeasure),
              param_type: str(m.paramType),
              param_value: str(x.value),
              param_value_num: num(x.value),
              dispersion_type: str(m.dispersionType),
              dispersion_value: str(x.spread),
              dispersion_value_num: num(x.spread),
              dispersion_lower_limit: num(x.lowerLimit),
              dispersion_upper_limit: num(x.upperLimit),
              explanation_of_na: str(x.comment),
            });
          }
        }
      }
    }
  }

  // outcomes
  for (const om of r.outcomeMeasuresModule?.outcomeMeasures ?? []) {
    const outcomeId = ids.next('outcomes');
    push('outcomes', {
      id: outcomeId,
      nct_id: nct,
      outcome_type: str(om.type),
      title: str(om.title),
      description: str(om.description),
      time_frame: str(om.timeFrame),
      population: str(om.populationDescription),
      units: str(om.unitOfMeasure),
      units_analyzed: str(om.typeUnitsAnalyzed),
      dispersion_type: str(om.dispersionType),
      param_type: str(om.paramType),
    });

    const og = new Map<string, number>();
    for (const g of om.groups ?? []) {
      const id = ids.next('result_groups');
      og.set(g.id, id);
      push('result_groups', {
        id,
        nct_id: nct,
        ctgov_group_code: g.id,
        result_type: 'Outcome',
        title: str(g.title),
        description: str(g.description),
      });
    }
    for (const d of om.denoms ?? []) {
      for (const c of d.counts ?? []) {
        push('outcome_counts', {
          id: ids.next('outcome_counts'),
          nct_id: nct,
          outcome_id: outcomeId,
          result_group_id: og.get(c.groupId) ?? null,
          ctgov_group_code: c.groupId,
          scope: 'Measure',
          units: str(d.units),
          count: num(c.value),
        });
      }
    }
    for (const cls of om.classes ?? []) {
      for (const cat of cls.categories ?? []) {
        for (const x of cat.measurements ?? []) {
          push('outcome_measurements', {
            id: ids.next('outcome_measurements'),
            nct_id: nct,
            outcome_id: outcomeId,
            result_group_id: og.get(x.groupId) ?? null,
            ctgov_group_code: x.groupId,
            classification: str(cls.title),
            category: str(cat.title),
            title: str(om.title),
            description: str(om.description),
            units: str(om.unitOfMeasure),
            param_type: str(om.paramType),
            param_value: str(x.value),
            param_value_num: num(x.value),
            dispersion_type: str(om.dispersionType),
            dispersion_value: str(x.spread),
            dispersion_value_num: num(x.spread),
            dispersion_lower_limit: num(x.lowerLimit),
            dispersion_upper_limit: num(x.upperLimit),
            explanation_of_na: str(x.comment),
          });
        }
      }
    }
    for (const a of om.analyses ?? []) {
      const analysisId = ids.next('outcome_analyses');
      const pv = splitPValue(a.pValue);
      push('outcome_analyses', {
        id: analysisId,
        nct_id: nct,
        outcome_id: outcomeId,
        non_inferiority_type: str(a.nonInferiorityType),
        non_inferiority_description: str(a.nonInferiorityComment),
        param_type: str(a.paramType),
        param_value: num(a.paramValue),
        dispersion_type: str(a.dispersionType),
        dispersion_value: num(a.dispersionValue),
        p_value_modifier: pv.modifier,
        p_value: pv.value,
        p_value_description: str(a.pValueComment),
        ci_n_sides: str(a.ciNumSides),
        ci_percent: num(a.ciPctValue),
        ci_lower_limit: num(a.ciLowerLimit),
        ci_upper_limit: num(a.ciUpperLimit),
        ci_upper_limit_na_comment: str(a.ciUpperLimitComment),
        method: str(a.statisticalMethod),
        method_description: str(a.statisticalComment),
        estimate_description: str(a.estimateComment),
        groups_description: str(a.groupDescription),
        other_analysis_description: str(a.otherAnalysisDescription),
      });
      for (const code of a.groupIds ?? []) {
        push('outcome_analysis_groups', {
          id: ids.next('outcome_analysis_groups'),
          nct_id: nct,
          outcome_analysis_id: analysisId,
          result_group_id: og.get(code) ?? null,
          ctgov_group_code: code,
        });
      }
    }
  }

  return rows;
}
