"""The comparability gate (ENIGMA_ROADMAP.md §4).

Two effect records are comparable only if all eight dimensions clear the
threshold. The gate score is the minimum across dimensions, never the mean:
one hard failure ends the comparison.
"""

from __future__ import annotations

import math
from typing import Any, Callable

from .effects import Z95, Effect, convertible, to_scale
from .models import Model
from .provenance import Chain, Factor, Threshold

DIMENSIONS = (
    "endpoint", "measure", "population", "intervention", "comparator", "timepoint", "analysisPopulation", "direction",
)
EVENT_MEASURES = {"OR", "RR", "RD", "HR"}


class Tuning(Model):
    gate_threshold: float = 0.70
    dose_equivalence_band: float = 0.25
    timepoint_overlap_min_days: int = 14
    i2_threshold: float = 0.60
    # Hops up the endpoint tree that still count as the same endpoint. 0 means same node only.
    endpoint_ancestor_hops: int = 0


class Baseline(Model):
    age_mean: float | None = None
    female_pct: float | None = None
    hba1c_mean: float | None = None
    bmi_mean: float | None = None


class Population(Model):
    age_min: float | None = None
    age_max: float | None = None
    sex: str = "ALL"
    hba1c_min: float | None = None
    hba1c_max: float | None = None
    bmi_min: float | None = None
    bmi_max: float | None = None
    background: str = "UNSPECIFIED"
    cv_risk: str = "GENERAL"
    renal: str = "GENERAL"
    heart_failure: bool = False
    baseline: Baseline = Baseline()


class GateRecord(Model):
    id: str
    nct_id: str
    endpoint_node_id: str | None = None
    # Node ids from the family root down to this node.
    endpoint_path: list[str] = []
    measure: str
    value: float
    ci_low: float
    ci_high: float
    se: float
    n: int | None = None
    control_risk: float | None = None
    pooled_sd: float | None = None
    units: str | None = None
    lower_is_better: bool | None = None
    direction_resolved: bool = False
    agents: list[str] = []
    agent_class: str | None = None
    dose_daily: float | None = None
    dose_unit: str | None = None
    comparator_class: str | None = None
    comparator_agents: list[str] = []
    background_agents: list[str] = []
    comparator_dose_daily: float | None = None
    timepoint_days: int | None = None
    analysis_population: str | None = None

    def effect(self) -> Effect:
        return Effect(
            measure=self.measure,  # type: ignore[arg-type]
            value=self.value, ci_low=self.ci_low, ci_high=self.ci_high, se=self.se, n=self.n,
            control_risk=self.control_risk, pooled_sd=self.pooled_sd,
            direction_convention="", direction_resolved=self.direction_resolved,
        )


class Edge(Model):
    a_id: str
    b_id: str
    gate_score: float
    passed: bool
    weakest_dimension: str
    dimension_scores: dict[str, float]
    failure_reasons: dict[str, str]
    # Measure both records are expressed in for the incompatibility tests, when the gate passes.
    common_measure: str | None = None
    apparent_conflict: bool
    factors: list[Factor]


Result = tuple[float, str | None, str, dict[str, Any], str]
"""score, failure reason (when below threshold), rule id, inputs, note"""


# ------------------------------------------------------------------ dimensions


def _endpoint(a: GateRecord, b: GateRecord, t: Tuning) -> Result:
    inputs = {"a": a.endpoint_node_id, "b": b.endpoint_node_id}
    if not a.endpoint_node_id or not b.endpoint_node_id:
        return 0.0, "ENDPOINT_UNMAPPED", "endpoint.unmapped", inputs, "An outcome is not mapped to an endpoint node."
    if a.endpoint_node_id == b.endpoint_node_id:
        return 1.0, None, "endpoint.same_node", inputs, "Same endpoint node."
    pa, pb = a.endpoint_path, b.endpoint_path
    shorter, longer = (pa, pb) if len(pa) <= len(pb) else (pb, pa)
    if longer[: len(shorter)] == shorter:
        hops = len(longer) - len(shorter)
        inputs["hops"] = hops
        if hops <= t.endpoint_ancestor_hops:
            return 1.0 - 0.15 * hops, None, "endpoint.ancestor_within_hops", inputs, f"Ancestor within {hops} hop(s)."
        return 0.5, "ENDPOINT_ANCESTOR", "endpoint.ancestor", inputs, "One endpoint is a broader version of the other."
    if len(pa) >= 2 and len(pb) >= 2 and pa[-2] == pb[-2]:
        return 0.3, "ENDPOINT_SIBLING", "endpoint.sibling", inputs, "Different outcomes under the same parent."
    if pa and pb and pa[0] == pb[0]:
        return 0.1, "ENDPOINT_DIFFERENT", "endpoint.same_family", inputs, "Same family, different outcomes."
    return 0.0, "ENDPOINT_DIFFERENT", "endpoint.different_family", inputs, "Different endpoint families."


def common_measure(a: GateRecord, b: GateRecord) -> tuple[str | None, float, str | None, str, str]:
    """Returns (measure both can be expressed in, score, failure reason, rule, note)."""
    ea, eb = a.effect(), b.effect()
    if a.measure == b.measure:
        if a.measure != "MD" or a.units == b.units:
            return a.measure, 1.0, None, "measure.same", "Same effect measure and unit."
        # Different units after harmonization mean different instruments. Standardizing would hide that.
        return None, 0.0, "MEASURE_NOT_CONVERTIBLE", "measure.unit_mismatch", "Mean differences in different units."
    pair = {a.measure, b.measure}
    continuous = {"MD", "SMD"}
    if pair <= continuous:
        if convertible(a.measure, "SMD", ea) and convertible(b.measure, "SMD", eb):
            return "SMD", 0.8, None, "measure.md_to_smd", "Standardized by pooled SD."
        return None, 0.0, "MEASURE_NOT_CONVERTIBLE", "measure.no_pooled_sd", "No pooled SD to standardize the mean difference."
    if pair & continuous:
        return None, 0.0, "MEASURE_CLASS_MISMATCH", "measure.continuous_vs_event", "A continuous measure against an event measure."
    if pair == {"HR", "RD"}:
        return None, 0.0, "MEASURE_CLASS_MISMATCH", "measure.hr_vs_rd", "A hazard ratio against a risk difference."
    if not (convertible(a.measure, "RR", ea) and convertible(b.measure, "RR", eb)):
        return None, 0.0, "MEASURE_NOT_CONVERTIBLE", "measure.no_control_risk", "Conversion to a risk ratio needs the comparator-arm risk."
    if "HR" in pair:
        risk = max(a.control_risk or 0.0, b.control_risk or 0.0)
        if risk >= 0.2:
            return None, 0.6, "MEASURE_NOT_CONVERTIBLE", "measure.hr_high_event_rate", "Comparator risk of 20% or more: hazard and risk ratios diverge."
        return "RR", 0.75, None, "measure.hr_to_rr", "Hazard ratio converted to a risk ratio at a comparator risk below 20%."
    return "RR", 0.85, None, "measure.to_rr", "Converted to risk ratios using the comparator-arm risk."


def _measure(a: GateRecord, b: GateRecord, _: Tuning) -> Result:
    _, score, reason, rule, note = common_measure(a, b)
    inputs = {"a": a.measure, "b": b.measure, "unitsA": a.units, "unitsB": b.units,
              "controlRiskA": a.control_risk, "controlRiskB": b.control_risk}
    return score, reason, rule, inputs, note


def _range_overlap(lo_a: float | None, hi_a: float | None, lo_b: float | None, hi_b: float | None, floor: float, ceil: float) -> float:
    la, ha = lo_a if lo_a is not None else floor, hi_a if hi_a is not None else ceil
    lb, hb = lo_b if lo_b is not None else floor, hi_b if hi_b is not None else ceil
    width = min(ha - la, hb - lb)
    if width <= 0:
        return 0.0
    return max(0.0, min(ha, hb) - max(la, lb)) / width


THERAPY_LINE = {"NAIVE": 0, "METFORMIN": 1, "SU": 1, "DUAL_ORAL": 2, "INSULIN": 3}


def _closeness(x: float | None, y: float | None, free: float, zero: float) -> float | None:
    if x is None or y is None:
        return None
    d = abs(x - y)
    return 1.0 if d <= free else max(0.0, 1 - (d - free) / (zero - free))


def population_scores(pa: Population, pb: Population) -> dict[str, float]:
    s: dict[str, float] = {"ageRange": _range_overlap(pa.age_min, pa.age_max, pb.age_min, pb.age_max, 18, 100)}
    if any(v is not None for v in (pa.hba1c_min, pa.hba1c_max, pb.hba1c_min, pb.hba1c_max)):
        s["hba1cRange"] = _range_overlap(pa.hba1c_min, pa.hba1c_max, pb.hba1c_min, pb.hba1c_max, 4.5, 15)
    if any(v is not None for v in (pa.bmi_min, pa.bmi_max, pb.bmi_min, pb.bmi_max)):
        s["bmiRange"] = _range_overlap(pa.bmi_min, pa.bmi_max, pb.bmi_min, pb.bmi_max, 15, 60)
    la, lb = THERAPY_LINE.get(pa.background), THERAPY_LINE.get(pb.background)
    if la is None or lb is None:
        s["background"] = 0.75
    elif pa.background == pb.background:
        s["background"] = 1.0
    else:
        s["background"] = max(0.1, 0.8 - 0.3 * abs(la - lb))
    s["cvRisk"] = 1.0 if pa.cv_risk == pb.cv_risk else 0.5
    s["renal"] = 1.0 if pa.renal == pb.renal else 0.5
    s["heartFailure"] = 1.0 if pa.heart_failure == pb.heart_failure else 0.6
    s["sex"] = 1.0 if pa.sex == pb.sex else (0.6 if "ALL" in (pa.sex, pb.sex) else 0.0)
    for key, value in (
        ("baselineHba1c", _closeness(pa.baseline.hba1c_mean, pb.baseline.hba1c_mean, 0.5, 2.5)),
        ("baselineAge", _closeness(pa.baseline.age_mean, pb.baseline.age_mean, 5, 25)),
    ):
        if value is not None:
            s[key] = value
    return s


def _population(pa: Population, pb: Population) -> Result:
    scores = population_scores(pa, pb)
    limiting = min(scores, key=lambda k: scores[k])
    score = scores[limiting]
    inputs = {
        "subScores": scores, "limiting": limiting,
        "a": {"background": pa.background, "cvRisk": pa.cv_risk, "renal": pa.renal, "hba1c": [pa.hba1c_min, pa.hba1c_max],
              "age": [pa.age_min, pa.age_max], "baselineHba1c": pa.baseline.hba1c_mean},
        "b": {"background": pb.background, "cvRisk": pb.cv_risk, "renal": pb.renal, "hba1c": [pb.hba1c_min, pb.hba1c_max],
              "age": [pb.age_min, pb.age_max], "baselineHba1c": pb.baseline.hba1c_mean},
    }
    return score, "POPULATION_LOW_OVERLAP", "population.min_sub_score", inputs, f"Limited by {limiting}."


def _intervention(a: GateRecord, b: GateRecord, t: Tuning) -> Result:
    inputs: dict[str, Any] = {"a": a.agents, "b": b.agents, "doseA": a.dose_daily, "doseB": b.dose_daily, "unit": a.dose_unit}
    if not a.agents or not b.agents:
        return 0.0, "INTERVENTION_DIFFERENT_CLASS", "intervention.unmapped", inputs, "No recognized agent."
    if sorted(a.agents) != sorted(b.agents):
        if a.agent_class and a.agent_class == b.agent_class:
            return 0.4, "INTERVENTION_DIFFERENT_AGENT", "intervention.same_class", inputs, "Different agents of one class."
        return 0.0, "INTERVENTION_DIFFERENT_CLASS", "intervention.different_class", inputs, "Different drug classes."
    bg_a, bg_b = sorted(a.background_agents), sorted(b.background_agents)
    if bg_a and bg_b and bg_a != bg_b:
        inputs["backgroundA"], inputs["backgroundB"] = bg_a, bg_b
        return 0.5, "INTERVENTION_BACKGROUND_DIFFERS", "intervention.background_differs", inputs, "Same agent on different background drugs."
    if a.dose_daily is None or b.dose_daily is None or a.dose_unit != b.dose_unit:
        return 0.75, None, "intervention.dose_not_encoded", inputs, "Same agent. Dose not encoded for one or both."
    ratio = min(a.dose_daily, b.dose_daily) / max(a.dose_daily, b.dose_daily)
    inputs["ratio"] = ratio
    inputs["band"] = t.dose_equivalence_band
    if 1 - ratio <= t.dose_equivalence_band + 1e-9:
        return 1.0, None, "intervention.dose_within_band", inputs, "Same agent, doses within the equivalence band."
    return min(ratio, 0.65), "INTERVENTION_DOSE_OUTSIDE_BAND", "intervention.dose_outside_band", inputs, "Same agent, doses outside the band."


CONTROL_LIKE = {"PLACEBO", "NO_TREATMENT", "STANDARD_OF_CARE"}


def _comparator(a: GateRecord, b: GateRecord, t: Tuning) -> Result:
    ca, cb = a.comparator_class, b.comparator_class
    inputs = {"a": ca, "b": cb, "agentsA": a.comparator_agents, "agentsB": b.comparator_agents}
    if not ca or not cb:
        return 0.0, "COMPARATOR_CLASS_MISMATCH", "comparator.unknown", inputs, "Comparator not classified."
    if ca == cb:
        if ca == "ACTIVE" and sorted(a.comparator_agents) != sorted(b.comparator_agents):
            return 0.4, "COMPARATOR_DIFFERENT_ACTIVE", "comparator.different_active", inputs, "Active controls are different agents."
        if ca == "DOSE_COMPARISON":
            ra, rb = a.comparator_dose_daily, b.comparator_dose_daily
            inputs["referenceDoseA"], inputs["referenceDoseB"] = ra, rb
            if ra and rb and 1 - min(ra, rb) / max(ra, rb) <= t.dose_equivalence_band + 1e-9:
                return 1.0, None, "comparator.same_reference_dose", inputs, "Both compare against the same reference dose."
            return 0.3, "COMPARATOR_REFERENCE_DOSE_DIFFERS", "comparator.reference_dose_differs", inputs, "Reference doses differ or are not encoded."
        if ca == "STANDARD_OF_CARE":
            return 0.6, "COMPARATOR_UNSPECIFIED_CONTROL", "comparator.standard_of_care", inputs, "Both against a control whose content is not recorded."
        return 1.0, None, "comparator.same_class", inputs, "Same comparator class."
    if ca in CONTROL_LIKE and cb in CONTROL_LIKE:
        return 0.6, "COMPARATOR_CLASS_MISMATCH", "comparator.control_variants", inputs, "Placebo against untreated or standard-care control."
    return 0.0, "COMPARATOR_CLASS_MISMATCH", "comparator.class_mismatch", inputs, "Different comparator classes."


def _timepoint(a: GateRecord, b: GateRecord, t: Tuning) -> Result:
    inputs: dict[str, Any] = {"daysA": a.timepoint_days, "daysB": b.timepoint_days, "minOverlapDays": t.timepoint_overlap_min_days}
    if not a.timepoint_days or not b.timepoint_days:
        return 0.5, "TIMEPOINT_UNKNOWN", "timepoint.unknown", inputs, "Follow-up length not readable."
    if abs(a.timepoint_days - b.timepoint_days) <= t.timepoint_overlap_min_days:
        return 1.0, None, "timepoint.within_window", inputs, "Follow-up lengths within the window."
    ratio = min(a.timepoint_days, b.timepoint_days) / max(a.timepoint_days, b.timepoint_days)
    inputs["ratio"] = ratio
    if a.measure in EVENT_MEASURES and b.measure in EVENT_MEASURES:
        # Ratios of event risk move slowly with follow-up, so the penalty is the square root of the ratio.
        return math.sqrt(ratio), "TIMEPOINT_NO_OVERLAP", "timepoint.event_sqrt_ratio", inputs, "Event outcome: score = sqrt(shorter / longer)."
    return ratio, "TIMEPOINT_NO_OVERLAP", "timepoint.ratio", inputs, "Continuous outcome: score = shorter / longer."


def _analysis_population(a: GateRecord, b: GateRecord, _: Tuning) -> Result:
    pa, pb = a.analysis_population or "UNKNOWN", b.analysis_population or "UNKNOWN"
    inputs = {"a": pa, "b": pb}
    if "UNKNOWN" in (pa, pb):
        return 0.75, None, "analysis_population.unknown", inputs, "Analysis population not stated for one or both."
    if pa == pb:
        return 1.0, None, "analysis_population.same", inputs, "Same analysis population."
    if "PP" in (pa, pb):
        return 0.4, "ANALYSIS_POPULATION_MISMATCH", "analysis_population.per_protocol_vs_other", inputs, "Per-protocol against a randomized or treated set."
    if {pa, pb} == {"ITT", "MITT"}:
        return 0.85, None, "analysis_population.itt_vs_mitt", inputs, "ITT against modified ITT."
    return 0.75, None, "analysis_population.as_treated_vs_itt", inputs, "As-treated against ITT or modified ITT."


def _direction(a: GateRecord, b: GateRecord, _: Tuning) -> Result:
    inputs = {"resolvedA": a.direction_resolved, "resolvedB": b.direction_resolved,
              "lowerIsBetterA": a.lower_is_better, "lowerIsBetterB": b.lower_is_better}
    if a.direction_resolved and b.direction_resolved and a.lower_is_better == b.lower_is_better:
        return 1.0, None, "direction.resolved", inputs, "Both records use the experimental arm first."
    return 0.0, "DIRECTION_UNRESOLVED", "direction.unresolved", inputs, "Sign convention not established for one or both."


def apparent_conflict(a: GateRecord, b: GateRecord) -> bool:
    """What a reader comparing headline numbers would call a conflict, before any comparability check."""
    za, zb = to_scale(a.measure, a.value) / a.se, to_scale(b.measure, b.value) / b.se
    opposite = za * zb < 0 and abs(za) > Z95 and abs(zb) > Z95
    same_scale = a.measure == b.measure and (a.measure != "MD" or a.units == b.units)
    disjoint = same_scale and (a.ci_high < b.ci_low or b.ci_high < a.ci_low)
    return bool(opposite or disjoint)


def score_pair(a: GateRecord, b: GateRecord, pa: Population, pb: Population, t: Tuning) -> Edge:
    chain = Chain("GATE")
    threshold = Threshold(name="gateThreshold", value=t.gate_threshold, op=">=")
    checks: dict[str, Callable[[], Result]] = {
        "endpoint": lambda: _endpoint(a, b, t),
        "measure": lambda: _measure(a, b, t),
        "population": lambda: _population(pa, pb),
        "intervention": lambda: _intervention(a, b, t),
        "comparator": lambda: _comparator(a, b, t),
        "timepoint": lambda: _timepoint(a, b, t),
        "analysisPopulation": lambda: _analysis_population(a, b, t),
        "direction": lambda: _direction(a, b, t),
    }
    scores: dict[str, float] = {}
    reasons: dict[str, str] = {}
    for dimension in DIMENSIONS:
        score, reason, rule, inputs, note = checks[dimension]()
        score = round(max(0.0, min(1.0, score)), 4)
        ok = score >= t.gate_threshold
        scores[dimension] = score
        if not ok:
            reasons[dimension] = reason or "BELOW_THRESHOLD"
        chain.add(f"gate.{dimension}", rule, inputs, score, note, score=score, outcome="PASS" if ok else "FAIL", threshold=threshold)

    weakest = min(DIMENSIONS, key=lambda d: scores[d])
    gate_score = scores[weakest]
    passed = gate_score >= t.gate_threshold
    chain.add(
        "gate.score", "gate.min_across_dimensions", {"scores": scores}, gate_score,
        f"Gate score is the minimum across dimensions: {weakest}.",
        score=gate_score, outcome="PASS" if passed else "FAIL", threshold=threshold,
    )
    return Edge(
        a_id=a.id, b_id=b.id, gate_score=gate_score, passed=passed, weakest_dimension=weakest,
        dimension_scores=scores, failure_reasons=reasons,
        common_measure=common_measure(a, b)[0] if passed else None,
        apparent_conflict=apparent_conflict(a, b), factors=chain.factors,
    )
