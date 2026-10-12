import json
import math
from pathlib import Path

import pytest

from enigma_engine.effects import Arm, Candidate, ConversionError, convert, make_effect, normalize, to_scale

FIXTURE = Path(__file__).resolve().parents[3] / "fixtures" / "effects_roundtrip_500.json"
TOLERANCE = 1e-9


def _rel(a: float, b: float) -> float:
    return abs(a - b) / max(1.0, abs(b))


def test_round_trip_fixture_has_500_records():
    assert len(json.loads(FIXTURE.read_text())) == 500


@pytest.mark.parametrize("rec", json.loads(FIXTURE.read_text()), ids=lambda r: r["id"])
def test_conversion_round_trips(rec):
    """Phase 1 gate: source -> target -> source returns the original value and interval."""
    effect = make_effect(
        rec["source"], to_scale(rec["source"], rec["value"]), rec["se"],
        control_risk=rec["controlRisk"], pooled_sd=rec["pooledSd"],
    )
    try:
        there = convert(effect, rec["target"])
    except ConversionError:
        pytest.skip("conversion undefined for this control risk")
    back = convert(there, rec["source"])
    assert _rel(back.value, effect.value) < TOLERANCE
    assert _rel(back.ci_low, effect.ci_low) < TOLERANCE
    assert _rel(back.ci_high, effect.ci_high) < TOLERANCE
    assert _rel(back.se, effect.se) < 1e-6


def test_or_to_rr_known_value():
    # OR 2.0 at 20% control risk: RR = 2 / (1 - 0.2 + 0.2 * 2) = 1.6667
    effect = make_effect("OR", math.log(2.0), 0.1, control_risk=0.2)
    assert convert(effect, "RR").value == pytest.approx(2 / 1.2)


def test_hr_to_rr_known_value():
    # HR 0.5 at 10% control risk: risk = 1 - 0.9^0.5 = 0.05132
    effect = make_effect("HR", math.log(0.5), 0.1, control_risk=0.1)
    assert convert(effect, "RR").value == pytest.approx((1 - 0.9**0.5) / 0.1)


def test_conversion_without_control_risk_is_refused():
    with pytest.raises(ConversionError):
        convert(make_effect("OR", 0.3, 0.1), "RR")


def _analysis(**kw) -> Candidate:
    base = dict(ref="t", source_kind="ANALYSIS", measure="HR", value=0.86, ci_low=0.74, ci_high=0.99,
                ci_level=0.95, ci_sides=2, outcome_kind="TIME_TO_EVENT", arm_param="PERCENT",
                experimental=Arm(n=4687, value=10.5), comparator=Arm(n=2333, value=12.1))
    return Candidate(**{**base, **kw})


def test_hazard_ratio_with_interval_and_matching_arms():
    out = normalize(_analysis())
    assert out.ok and out.effect is not None
    assert out.effect.value == pytest.approx(0.86, abs=1e-9)
    assert out.effect.se == pytest.approx((math.log(0.99) - math.log(0.74)) / (2 * 1.959964), rel=1e-5)
    assert out.effect.direction_resolved
    assert out.effect.control_risk == pytest.approx(0.121)


def test_comparator_first_ratio_is_inverted_when_the_order_is_stated():
    # Stated as placebo / drug, and the arm data agree: the drug arm had fewer events.
    out = normalize(_analysis(value=1 / 0.86, ci_low=1 / 0.99, ci_high=1 / 0.74, direction_hint="COMPARATOR_FIRST"))
    assert out.ok and out.effect is not None
    assert out.effect.value == pytest.approx(0.86, rel=1e-9)
    assert out.effect.direction_resolved


def test_sign_that_contradicts_arm_data_with_no_stated_order_is_unresolved():
    # Could be a comparator-first analysis or an arm value posted with the wrong sign. Not flipped.
    out = normalize(_analysis(value=1 / 0.86, ci_low=1 / 0.99, ci_high=1 / 0.74))
    assert out.ok and out.effect is not None
    assert out.effect.value == pytest.approx(1 / 0.86, rel=1e-9)
    assert not out.effect.direction_resolved


def test_stated_order_that_contradicts_arm_data_is_unresolved():
    out = normalize(_analysis(direction_hint="COMPARATOR_FIRST"))
    assert out.ok and out.effect is not None and not out.effect.direction_resolved


def test_no_hint_and_no_arm_signal_is_unresolved():
    out = normalize(_analysis(experimental=None, comparator=None))
    assert out.ok and out.effect is not None and not out.effect.direction_resolved


def test_se_from_exact_p_value():
    out = normalize(_analysis(measure="MD", value=-0.5, ci_low=None, ci_high=None, p_value=0.01,
                              outcome_kind="CONTINUOUS", arm_param="MEAN", arm_dispersion="SD",
                              experimental=Arm(n=100, value=-1.0, spread=1.0), comparator=Arm(n=100, value=-0.5, spread=1.0)))
    assert out.ok and out.effect is not None
    assert out.effect.se == pytest.approx(0.5 / 2.5758293, rel=1e-5)
    assert out.effect.dispersion_type == "P_VALUE"


def test_inequality_p_value_gives_no_uncertainty():
    out = normalize(_analysis(ci_low=None, ci_high=None, p_value=0.001, p_value_modifier="<"))
    assert not out.ok and out.reason == "NO_UNCERTAINTY"


def test_log_scale_ratio_is_exponentiated():
    out = normalize(_analysis(measure="OR", log_scale=True, value=math.log(0.8), ci_low=math.log(0.6), ci_high=math.log(1.05)))
    assert out.ok and out.effect is not None
    assert out.effect.value == pytest.approx(0.8)


def test_risk_ratio_derived_from_arm_counts():
    out = normalize(Candidate(ref="d", source_kind="DERIVED_ARMS", outcome_kind="BINARY", arm_param="COUNT",
                              experimental=Arm(n=200, value=30), comparator=Arm(n=200, value=60)))
    assert out.ok and out.effect is not None
    assert out.effect.measure == "RR" and out.effect.value == pytest.approx(0.5)
    assert out.effect.se == pytest.approx(math.sqrt(1 / 30 - 1 / 200 + 1 / 60 - 1 / 200))
    assert out.effect.direction_resolved


def test_zero_cell_gets_continuity_correction_and_double_zero_is_rejected():
    one = normalize(Candidate(ref="z", source_kind="DERIVED_ARMS", outcome_kind="BINARY", arm_param="COUNT",
                              experimental=Arm(n=50, value=0), comparator=Arm(n=50, value=5)))
    assert one.ok and one.effect is not None and one.effect.value == pytest.approx((0.5 / 51) / (5.5 / 51))
    both = normalize(Candidate(ref="z", source_kind="DERIVED_ARMS", outcome_kind="BINARY", arm_param="COUNT",
                               experimental=Arm(n=50, value=0), comparator=Arm(n=50, value=0)))
    assert not both.ok and both.reason == "NO_EVENTS"


def test_mean_difference_derived_from_arm_means_with_se_dispersion():
    out = normalize(Candidate(ref="m", source_kind="DERIVED_ARMS", outcome_kind="CONTINUOUS", arm_param="MEAN",
                              arm_dispersion="SE", experimental=Arm(n=100, value=-1.2, spread=0.1),
                              comparator=Arm(n=100, value=-0.4, spread=0.1)))
    assert out.ok and out.effect is not None
    assert out.effect.value == pytest.approx(-0.8)
    assert out.effect.se == pytest.approx(math.sqrt(0.02))
    assert out.effect.pooled_sd == pytest.approx(1.0)


def test_out_of_range_estimate_is_rejected():
    out = normalize(_analysis(measure="MD", value=5e12, ci_low=4e12, ci_high=6e12, outcome_kind="CONTINUOUS",
                              experimental=None, comparator=None, direction_hint="EXPERIMENTAL_FIRST"))
    assert not out.ok and out.reason == "OUT_OF_RANGE"
