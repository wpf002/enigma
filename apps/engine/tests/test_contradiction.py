import math

import pytest

from enigma_engine.contradiction import (
    ClusterInput, GateNotPassed, Member, PairInput, TrialMeta, analyze_cluster, benjamini_hochberg, classify_pair,
)
from enigma_engine.gate import GateRecord, Population, Tuning
from enigma_engine.meta import cumulative, meta_regression, pool
from enigma_engine.ranking import RankItem, rank

T = Tuning()
ONES = {d: 1.0 for d in ("endpoint", "measure", "population", "intervention", "comparator", "timepoint", "analysisPopulation", "direction")}


def hr(id: str, value: float, lo: float, hi: float, **kw) -> GateRecord:
    se = (math.log(hi) - math.log(lo)) / (2 * 1.959964)
    base = dict(id=id, nct_id=f"NCT{id}", measure="HR", value=value, ci_low=lo, ci_high=hi, se=se, n=5000,
                control_risk=0.1, direction_resolved=True, lower_is_better=True, agents=["x"], dose_daily=10, dose_unit="mg",
                comparator_class="PLACEBO", timepoint_days=1000, analysis_population="ITT")
    return GateRecord(**{**base, **kw})


def pair(a: GateRecord, b: GateRecord, **kw) -> PairInput:
    return PairInput(edge_id="e", gate_score=kw.pop("gate_score", 1.0), common_measure="HR", dimension_scores=kw.pop("scores", ONES), a=a, b=b, **kw)


def test_c1_direction_conflict():
    r = classify_pair(pair(hr("1", 0.75, 0.65, 0.87), hr("2", 1.30, 1.10, 1.54)), T)
    assert r.type == "C1"
    assert 0.5 < r.severity <= 1.0
    assert r.factors[-3].rule == "classify.c1_direction_conflict"


def test_c1_severity_grows_with_the_weaker_signal():
    weak = classify_pair(pair(hr("1", 0.80, 0.65, 0.985), hr("2", 1.25, 1.02, 1.53)), T)
    strong = classify_pair(pair(hr("1", 0.60, 0.52, 0.69), hr("2", 1.60, 1.40, 1.83)), T)
    assert weak.type == strong.type == "C1" and strong.severity > weak.severity


def test_c2_same_direction_disjoint_intervals():
    r = classify_pair(pair(hr("1", 0.50, 0.42, 0.60), hr("2", 0.85, 0.76, 0.95)), T)
    assert r.type == "C2" and 0.15 < r.severity <= 0.75


def test_c3_null_against_effect():
    r = classify_pair(pair(hr("1", 0.70, 0.60, 0.82), hr("2", 1.02, 0.90, 1.16)), T)
    assert r.type == "C3" and 0.3 < r.severity <= 0.9


def test_c3_needs_a_significant_difference_not_just_a_point_outside_the_null_interval():
    # A's estimate is outside B's interval, but A is imprecise: z of the difference is about 1.4.
    r = classify_pair(pair(hr("1", 0.62, 0.40, 0.96), hr("2", 0.98, 0.80, 1.20)), T)
    assert abs(r.z_diff) < 1.96 and r.type is None


def test_benjamini_hochberg_matches_hand_calculation():
    q = benjamini_hochberg([0.01, 0.04, 0.03, 0.5])
    assert q == pytest.approx([0.04, 0.0533333, 0.0533333, 0.5], rel=1e-5)


def test_overlapping_null_and_effect_is_not_a_contradiction():
    r = classify_pair(pair(hr("1", 0.85, 0.74, 0.98), hr("2", 0.93, 0.80, 1.08)), T)
    assert r.type is None and r.severity is None


def test_two_null_results_are_not_a_contradiction():
    assert classify_pair(pair(hr("1", 0.95, 0.80, 1.13), hr("2", 1.06, 0.90, 1.25)), T).type is None


def test_gate_first_is_enforced():
    with pytest.raises(GateNotPassed):
        classify_pair(pair(hr("1", 0.75, 0.65, 0.87), hr("2", 1.30, 1.10, 1.54), gate_score=0.4), T)


def test_measures_are_converted_before_testing():
    rr = GateRecord(**{**hr("2", 1.30, 1.10, 1.54).model_dump(), "measure": "RR"})
    p = PairInput(edge_id="e", gate_score=0.75, common_measure="RR", dimension_scores=ONES, a=hr("1", 0.75, 0.65, 0.87), b=rr)
    r = classify_pair(p, T)
    assert r.type == "C1" and r.a.measure == "RR"
    assert r.a.value == pytest.approx((1 - 0.9**0.75) / 0.1)
    assert r.factors[0].rule == "convert.hr_to_rr"


def test_discriminating_variable_is_the_largest_recorded_difference():
    a, b = hr("1", 0.75, 0.65, 0.87, timepoint_days=800), hr("2", 1.30, 1.10, 1.54, timepoint_days=1400, dose_daily=12)
    r = classify_pair(pair(a, b), T)
    assert r.discriminator.basis == "MEASURED" and r.discriminator.name == "follow-up length"
    assert r.discriminability == 1.0


def test_no_recorded_difference_gives_an_unidentified_discriminator_and_full_residual():
    r = classify_pair(pair(hr("1", 0.75, 0.65, 0.87), hr("2", 1.30, 1.10, 1.54)), T)
    assert r.discriminator.basis == "UNIDENTIFIED" and r.discriminability == 0.0
    assert r.unexplained_residual == 1.0


def test_terminated_trial_is_a_candidate_discriminator():
    p = pair(hr("1", 0.75, 0.65, 0.87), hr("2", 1.30, 1.10, 1.54),
             trial_a=TrialMeta(status="COMPLETED"), trial_b=TrialMeta(status="TERMINATED", stop_category="FUTILITY"))
    assert classify_pair(p, T).discriminator.name == "early termination"


def test_residual_is_the_product_of_dimension_scores():
    scores = {**ONES, "population": 0.75, "timepoint": 0.8}
    r = classify_pair(pair(hr("1", 0.75, 0.65, 0.87), hr("2", 1.30, 1.10, 1.54), scores=scores, gate_score=0.75), T)
    assert r.unexplained_residual == pytest.approx(0.6)


# ---- meta-analysis


def test_pool_matches_hand_calculation():
    p = pool([0.0, 1.0], [1.0, 1.0])
    assert p.theta_fixed == pytest.approx(0.5)
    assert p.q == pytest.approx(0.5) and p.i2 == 0.0 and p.tau2 == 0.0
    assert p.se_fixed == pytest.approx(math.sqrt(0.5))


def test_pool_heterogeneous_studies():
    p = pool([-0.5, 0.5, -0.4, 0.6], [0.1, 0.1, 0.1, 0.1])
    assert p.i2 > 0.9 and p.tau2 > 0 and p.se_random > p.se_fixed


def test_meta_regression_recovers_a_linear_moderator():
    x = [1.0, 2.0, 3.0, 4.0, 5.0]
    fit = meta_regression([0.1 * v for v in x], [0.02] * 5, x, "dose")
    assert fit is not None and fit.slope == pytest.approx(0.1) and fit.residual_i2 == 0.0 and fit.p < 0.001


def test_cumulative_has_one_point_per_study():
    points = cumulative([0.1, 0.2, 0.3], [0.1, 0.1, 0.1], ["a", "b", "c"], ["2010-01-01", "2011-01-01", "2012-01-01"])
    assert [p.k for p in points] == [1, 2, 3]


# ---- clusters


def member(i: int, theta: float, se: float, date: str, **mods) -> Member:
    lo, hi = math.exp(theta - 1.959964 * se), math.exp(theta + 1.959964 * se)
    return Member(record=hr(str(i), math.exp(theta), lo, hi), label=f"T{i}", completion_date=date, moderators=mods)


def test_c4_heterogeneity_with_no_moderator():
    members = [member(i, th, 0.08, f"201{i}-06-01", followUp=1000.0) for i, th in enumerate([-0.5, 0.4, -0.45, 0.5, -0.4])]
    r = analyze_cluster(ClusterInput(key="k", common_measure="HR", density=1.0, members=members), T)
    kinds = [f.type for f in r.findings]
    assert "C4" in kinds
    c4 = next(f for f in r.findings if f.type == "C4")
    assert r.pooled.i2 > 0.9 and c4.unexplained_residual > 0.6 and c4.discriminator.basis == "UNIDENTIFIED"


def test_heterogeneity_explained_by_a_moderator_is_not_c4():
    dose = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]
    members = [member(i, -0.1 * d, 0.03, f"201{i}-06-01", dose=d) for i, d in enumerate(dose)]
    r = analyze_cluster(ClusterInput(key="k", common_measure="HR", density=1.0, members=members), T)
    assert r.pooled.i2 > 0.6
    assert [f.type for f in r.findings if f.type == "C4"] == []
    assert r.moderators[0].name == "dose" and r.moderators[0].residual_i2 < 0.6


def test_c5_temporal_reversal():
    thetas = [-0.4, -0.35, 0.5, 0.6, 0.55]
    members = [member(i, th, 0.1, f"20{10 + i}-06-01") for i, th in enumerate(thetas)]
    r = analyze_cluster(ClusterInput(key="k", common_measure="HR", density=1.0, members=members), T)
    c5 = next(f for f in r.findings if f.type == "C5")
    assert c5.a.value < 1 < c5.b.value
    assert len(c5.a_nct_ids) == 2 and len(c5.b_nct_ids) > 2


def test_sparse_clusters_are_pooled_but_not_classified():
    members = [member(i, th, 0.08, f"201{i}-06-01") for i, th in enumerate([-0.5, 0.4, -0.45, 0.5])]
    r = analyze_cluster(ClusterInput(key="k", common_measure="HR", density=0.3, members=members), T)
    assert r.pooled is not None and r.findings == []


# ---- ranking


def item(id: str, **kw) -> RankItem:
    base = dict(id=id, gate_confidence=1.0, severity=1.0, patients=10000, unexplained_residual=1.0, discriminability=1.0, already_resolved=0.0)
    return RankItem(**{**base, **kw})


def test_diagnostic_value_formula_and_order():
    ranked = rank([item("a"), item("b", severity=0.5), item("c", already_resolved=1.0)])
    by = {r.id: r for r in ranked}
    assert by["a"].diagnostic_value == pytest.approx(1.0)
    assert by["b"].diagnostic_value == pytest.approx(0.875)
    assert by["c"].diagnostic_value == pytest.approx(0.7)
    assert [r.id for r in ranked] == ["a", "b", "c"] and [r.rank for r in ranked] == [1, 2, 3]


def test_cluster_weight_is_log_scaled_to_the_largest():
    ranked = {r.id: r for r in rank([item("big", patients=10000), item("small", patients=100)])}
    assert ranked["big"].components["clusterWeight"] == 1.0
    assert ranked["small"].components["clusterWeight"] == pytest.approx(math.log1p(100) / math.log1p(10000), abs=1e-4)
