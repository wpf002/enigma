import math

import pytest

from enigma_engine.gate import DIMENSIONS, GateRecord, Population, Tuning, apparent_conflict, score_pair

T = Tuning()


def rec(**kw) -> GateRecord:
    base = dict(
        id="a", nct_id="NCT1", endpoint_node_id="mace-3p", endpoint_path=["cv", "mace", "mace-3p"], measure="HR",
        value=0.86, ci_low=0.74, ci_high=0.99, se=0.0743, control_risk=0.12, lower_is_better=True,
        direction_resolved=True, agents=["empagliflozin"], agent_class="SGLT2I", dose_daily=10, dose_unit="mg",
        comparator_class="PLACEBO", timepoint_days=1100, analysis_population="ITT",
    )
    return GateRecord(**{**base, **kw})


def gate(a: GateRecord, b: GateRecord, pa: Population | None = None, pb: Population | None = None):
    return score_pair(a, b, pa or Population(), pb or Population(), T)


def test_unspecified_background_therapy_caps_the_score_below_one():
    edge = gate(rec(), rec(id="b", nct_id="NCT2"))
    assert edge.passed and edge.gate_score == 0.75 and edge.weakest_dimension == "population"


def test_identical_designs_pass_with_a_factor_per_dimension():
    same = Population(background="METFORMIN", hba1c_min=7, hba1c_max=10)
    edge = gate(rec(), rec(id="b", nct_id="NCT2"), same, same)
    assert edge.passed and edge.gate_score == 1.0
    assert [f.name for f in edge.factors] == [f"gate.{d}" for d in DIMENSIONS] + ["gate.score"]
    assert all(f.threshold and f.threshold.value == 0.7 for f in edge.factors)
    assert edge.common_measure == "HR"


def test_score_is_the_minimum_not_the_mean():
    edge = gate(rec(), rec(id="b", comparator_class="ACTIVE", comparator_agents=["glimepiride"]))
    assert edge.gate_score == 0.0 and not edge.passed
    assert edge.weakest_dimension == "comparator"
    assert sum(edge.dimension_scores.values()) / 8 > 0.8  # the mean would have passed
    assert edge.failure_reasons == {"comparator": "COMPARATOR_CLASS_MISMATCH"}


def test_all_cause_and_cardiovascular_mortality_are_not_the_same_endpoint():
    a = rec(endpoint_node_id="death-all-cause", endpoint_path=["cv", "death", "death-all-cause"])
    b = rec(id="b", endpoint_node_id="death-cv", endpoint_path=["cv", "death", "death-cv"])
    edge = gate(a, b)
    assert not edge.passed and edge.failure_reasons["endpoint"] == "ENDPOINT_SIBLING"


def test_broader_endpoint_fails_by_default_and_passes_when_hops_are_allowed():
    a = rec(endpoint_node_id="mi", endpoint_path=["cv", "mi"])
    b = rec(id="b", endpoint_node_id="mi-nonfatal", endpoint_path=["cv", "mi", "mi-nonfatal"])
    assert gate(a, b).failure_reasons["endpoint"] == "ENDPOINT_ANCESTOR"
    loose = score_pair(a, b, Population(), Population(), Tuning(endpoint_ancestor_hops=1))
    assert loose.dimension_scores["endpoint"] == pytest.approx(0.85)


def test_hazard_ratio_against_risk_difference_fails_on_measure():
    edge = gate(rec(), rec(id="b", measure="RD", value=-0.02, ci_low=-0.04, ci_high=0.0, se=0.01))
    assert edge.failure_reasons["measure"] == "MEASURE_CLASS_MISMATCH"


def test_odds_ratio_and_risk_ratio_convert_through_control_risk():
    a = rec(measure="OR", value=0.8, ci_low=0.6, ci_high=1.05, se=0.14)
    b = rec(id="b", measure="RR", value=0.85, ci_low=0.7, ci_high=1.03, se=0.1)
    edge = gate(a, b)
    assert edge.dimension_scores["measure"] == 0.85 and edge.common_measure == "RR"
    assert gate(rec(measure="OR", control_risk=None), b).failure_reasons["measure"] == "MEASURE_NOT_CONVERTIBLE"


def test_mean_differences_need_the_same_unit_or_a_pooled_sd():
    md = dict(measure="MD", value=-0.5, ci_low=-0.7, ci_high=-0.3, se=0.1, endpoint_node_id="hba1c-change", endpoint_path=["glycemic", "hba1c-change"])
    assert gate(rec(**md, units="%"), rec(id="b", **md, units="%")).dimension_scores["measure"] == 1.0
    assert gate(rec(**md, units="%"), rec(id="b", **md, units="score")).failure_reasons["measure"] == "MEASURE_NOT_CONVERTIBLE"
    assert gate(rec(**md, units="%", pooled_sd=1.0), rec(id="b", **md, units="score", pooled_sd=4.0)).common_measure == "SMD"


def test_dose_band():
    assert gate(rec(), rec(id="b", dose_daily=12.5)).dimension_scores["intervention"] == 1.0   # ratio 0.8
    far = gate(rec(dose_daily=5), rec(id="b", dose_daily=40))
    assert far.failure_reasons["intervention"] == "INTERVENTION_DOSE_OUTSIDE_BAND"
    assert far.dimension_scores["intervention"] == pytest.approx(0.125)
    just_outside = gate(rec(dose_daily=7), rec(id="b", dose_daily=10))  # ratio 0.7, outside a 0.25 band
    assert not just_outside.passed and just_outside.dimension_scores["intervention"] == 0.65
    assert gate(rec(dose_daily=None), rec(id="b")).dimension_scores["intervention"] == 0.75


def test_different_agents_of_one_class_fail_on_intervention():
    edge = gate(rec(), rec(id="b", agents=["canagliflozin"]))
    assert edge.failure_reasons["intervention"] == "INTERVENTION_DIFFERENT_AGENT"


def test_timepoint_twelve_weeks_against_five_years_fails():
    md = dict(measure="MD", value=-0.5, ci_low=-0.7, ci_high=-0.3, se=0.1, units="%")
    edge = gate(rec(**md, timepoint_days=84), rec(id="b", **md, timepoint_days=1826))
    assert edge.failure_reasons["timepoint"] == "TIMEPOINT_NO_OVERLAP"
    assert gate(rec(**md, timepoint_days=168), rec(id="b", **md, timepoint_days=182)).dimension_scores["timepoint"] == 1.0
    events = gate(rec(timepoint_days=800), rec(id="b", timepoint_days=1400))
    assert events.dimension_scores["timepoint"] == pytest.approx(math.sqrt(800 / 1400), abs=1e-4)
    assert gate(rec(timepoint_days=None), rec(id="b")).failure_reasons["timepoint"] == "TIMEPOINT_UNKNOWN"


def test_per_protocol_against_itt_fails():
    assert gate(rec(), rec(id="b", analysis_population="PP")).failure_reasons["analysisPopulation"] == "ANALYSIS_POPULATION_MISMATCH"
    assert gate(rec(), rec(id="b", analysis_population="MITT")).dimension_scores["analysisPopulation"] == 0.85


def test_unresolved_direction_fails():
    assert gate(rec(), rec(id="b", direction_resolved=False)).failure_reasons["direction"] == "DIRECTION_UNRESOLVED"


def test_treatment_naive_against_insulin_treated_fails_on_population():
    edge = gate(rec(), rec(id="b"), Population(background="NAIVE"), Population(background="INSULIN"))
    assert edge.failure_reasons["population"] == "POPULATION_LOW_OVERLAP"
    assert edge.factors[2].inputs["limiting"] == "background"


def test_disjoint_hba1c_ranges_fail_on_population():
    edge = gate(rec(), rec(id="b"), Population(hba1c_min=7, hba1c_max=8), Population(hba1c_min=9, hba1c_max=11))
    assert edge.dimension_scores["population"] == 0.0


def test_apparent_conflict_is_reported_even_when_the_gate_fails():
    a = rec()
    b = rec(id="b", value=1.3, ci_low=1.1, ci_high=1.54, se=0.086, agents=["rosiglitazone"], agent_class="TZD")
    edge = gate(a, b)
    assert not edge.passed and edge.apparent_conflict
    assert not apparent_conflict(a, rec(id="c", value=0.9, ci_low=0.78, ci_high=1.04, se=0.073))
