"""Effect-size normalization and conversion.

Ratios (OR, RR, HR) are analysed on the log scale. Differences (RD, MD, SMD)
are analysed on the raw scale. Every stored effect compares the experimental
arm to the comparator arm.
"""

from __future__ import annotations

import math
from typing import Literal

from scipy.stats import norm

from .models import Model
from .provenance import Chain, Factor

Measure = Literal["OR", "RR", "RD", "HR", "MD", "SMD"]
RATIO: frozenset[str] = frozenset({"OR", "RR", "HR"})
MEASURES: frozenset[str] = frozenset({"OR", "RR", "RD", "HR", "MD", "SMD"})
Z95 = float(norm.ppf(0.975))


def is_ratio(measure: str) -> bool:
    return measure in RATIO


def to_scale(measure: str, value: float) -> float:
    """Natural scale -> analysis scale."""
    return math.log(value) if is_ratio(measure) else value


def from_scale(measure: str, theta: float) -> float:
    return math.exp(theta) if is_ratio(measure) else theta


def convention(measure: str) -> str:
    return "EXPERIMENTAL_OVER_COMPARATOR" if is_ratio(measure) else "EXPERIMENTAL_MINUS_COMPARATOR"


class Effect(Model):
    """An effect size. The value never travels without its interval and convention."""

    measure: Measure
    value: float
    ci_low: float
    ci_high: float
    ci_level: float = 0.95
    se: float
    p_value: float | None = None
    n: int | None = None
    n_experimental: int | None = None
    n_comparator: int | None = None
    control_risk: float | None = None
    pooled_sd: float | None = None
    dispersion_type: Literal["CI", "SE", "P_VALUE", "ARM_LEVEL"] = "CI"
    direction_convention: str
    direction_resolved: bool = False

    @property
    def theta(self) -> float:
        return to_scale(self.measure, self.value)

    @property
    def z(self) -> float:
        """Distance from the null in standard errors."""
        return self.theta / self.se


def make_effect(measure: str, theta: float, se: float, **rest: object) -> Effect:
    """Builds an Effect with a 95% interval from an analysis-scale estimate and SE."""
    return Effect(
        measure=measure,  # type: ignore[arg-type]
        value=from_scale(measure, theta),
        ci_low=from_scale(measure, theta - Z95 * se),
        ci_high=from_scale(measure, theta + Z95 * se),
        ci_level=0.95,
        se=se,
        direction_convention=convention(measure),
        **rest,  # type: ignore[arg-type]
    )


# --------------------------------------------------------------------- arms


class Arm(Model):
    n: int | None = None
    value: float | None = None
    spread: float | None = None
    lower: float | None = None
    upper: float | None = None


class ArmSummary(Model):
    kind: Literal["BINARY", "CONTINUOUS"]
    n: int
    events: float | None = None
    risk: float | None = None
    mean: float | None = None
    sd: float | None = None


def summarize_arm(
    arm: Arm | None, outcome_kind: str, param: str | None, dispersion: str | None, ci_level: float | None
) -> ArmSummary | None:
    """Reduces posted arm-level data to events/n or mean/sd/n. None when it cannot be done."""
    if arm is None or arm.n is None or arm.n <= 0 or arm.value is None or not math.isfinite(arm.value):
        return None
    if outcome_kind in ("BINARY", "TIME_TO_EVENT") and param in ("COUNT", "PERCENT"):
        events = arm.value if param == "COUNT" else arm.value / 100.0 * arm.n
        if events < 0 or events > arm.n + 1e-9:
            return None
        return ArmSummary(kind="BINARY", n=arm.n, events=events, risk=events / arm.n)
    if outcome_kind == "CONTINUOUS" and param == "MEAN":
        sd: float | None = None
        if dispersion == "SD" and arm.spread is not None:
            sd = arm.spread
        elif dispersion == "SE" and arm.spread is not None:
            sd = arm.spread * math.sqrt(arm.n)
        elif dispersion == "CI" and arm.lower is not None and arm.upper is not None and ci_level:
            z = float(norm.ppf(1 - (1 - ci_level) / 2))
            sd = (arm.upper - arm.lower) / (2 * z) * math.sqrt(arm.n)
        if sd is not None and (not math.isfinite(sd) or sd <= 0):
            sd = None
        return ArmSummary(kind="CONTINUOUS", n=arm.n, mean=arm.value, sd=sd)
    return None


def pooled_sd(a: ArmSummary, b: ArmSummary) -> float | None:
    if a.sd is None or b.sd is None or a.n + b.n <= 2:
        return None
    return math.sqrt(((a.n - 1) * a.sd**2 + (b.n - 1) * b.sd**2) / (a.n + b.n - 2))


# --------------------------------------------------------- normalize request


class Candidate(Model):
    ref: str
    source_kind: Literal["ANALYSIS", "DERIVED_ARMS"]
    measure: str | None = None
    log_scale: bool = False
    percent_points: bool = False
    non_inferiority: bool = False
    value: float | None = None
    ci_low: float | None = None
    ci_high: float | None = None
    ci_level: float | None = None
    ci_sides: int | None = None
    p_value: float | None = None
    p_value_modifier: str | None = None
    dispersion_type: str | None = None
    dispersion_value: float | None = None
    direction_hint: Literal["EXPERIMENTAL_FIRST", "COMPARATOR_FIRST"] | None = None
    outcome_kind: Literal["BINARY", "CONTINUOUS", "TIME_TO_EVENT", "UNKNOWN"] = "UNKNOWN"
    arm_param: Literal["COUNT", "PERCENT", "MEAN"] | None = None
    arm_dispersion: Literal["SD", "SE", "CI"] | None = None
    arm_ci_level: float | None = None
    experimental: Arm | None = None
    comparator: Arm | None = None


class Normalized(Model):
    ref: str
    ok: bool
    reason: str | None = None
    detail: str | None = None
    effect: Effect | None = None
    factors: list[Factor] = []


def _fail(c: Candidate, chain: Chain, reason: str, detail: str) -> Normalized:
    chain.add("normalize.reject", f"reject.{reason.lower()}", {"ref": c.ref}, reason, detail, outcome="FAIL")
    return Normalized(ref=c.ref, ok=False, reason=reason, detail=detail, factors=chain.factors)


def _se_from_reported(c: Candidate, measure: str, value: float, chain: Chain) -> tuple[float, str] | None:
    """SE on the analysis scale from the reported interval, SE or exact p-value, in that order."""
    theta = to_scale(measure, value)
    level = c.ci_level if c.ci_level and 0.5 < c.ci_level < 1 else 0.95
    lo, hi = c.ci_low, c.ci_high
    positive = (lambda x: x is not None and x > 0) if is_ratio(measure) else (lambda x: x is not None)

    if (c.ci_sides or 2) == 2 and positive(lo) and positive(hi) and lo < hi and lo <= value <= hi:  # type: ignore[operator]
        z = float(norm.ppf(1 - (1 - level) / 2))
        se = (to_scale(measure, hi) - to_scale(measure, lo)) / (2 * z)  # type: ignore[arg-type]
        if se > 0:
            chain.add(
                "normalize.se", "se.from_two_sided_ci",
                {"ciLow": lo, "ciHigh": hi, "ciLevel": level, "z": z}, se,
                "SE = (upper - lower) / 2z on the analysis scale.",
            )
            return se, "CI"
    if c.ci_sides == 1:
        limit = hi if positive(hi) else lo if positive(lo) else None
        if limit is not None and limit != value:
            z = float(norm.ppf(level))
            se = abs(to_scale(measure, limit) - theta) / z
            chain.add(
                "normalize.se", "se.from_one_sided_ci", {"limit": limit, "ciLevel": level, "z": z}, se,
                "SE = |limit - estimate| / z for a one-sided interval.",
            )
            return se, "CI"
    if (
        not is_ratio(measure)
        and c.dispersion_type == "SE"
        and c.dispersion_value is not None
        and c.dispersion_value > 0
    ):
        chain.add(
            "normalize.se", "se.reported", {"dispersionValue": c.dispersion_value}, c.dispersion_value,
            "Standard error taken as reported.",
        )
        return c.dispersion_value, "SE"
    exact = c.p_value_modifier in (None, "", "=")
    if exact and not c.non_inferiority and c.p_value is not None and 0 < c.p_value < 1 and theta != 0:
        z = float(norm.isf(c.p_value / 2))
        if z > 0:
            se = abs(theta) / z
            chain.add(
                "normalize.se", "se.from_exact_p", {"pValue": c.p_value, "z": z}, se,
                "SE = |estimate| / z, with z from the exact two-sided p-value against the null.",
            )
            return se, "P_VALUE"
    return None


def _orientation(c: Candidate, measure: str, theta: float, se: float, derived: float | None, chain: Chain) -> tuple[bool, bool]:
    """Returns (resolved, flip). `derived` is the experimental-first effect computed from arm data."""
    if derived is None or abs(derived) < 0.25 * se:
        check = "INDETERMINATE"
    elif abs(theta - derived) <= abs(theta + derived):
        check = "SAME"
    else:
        check = "INVERTED"
    hint = c.direction_hint
    table = {
        ("EXPERIMENTAL_FIRST", "SAME"): (True, False, "Stated order and arm data agree: experimental arm first."),
        ("EXPERIMENTAL_FIRST", "INDETERMINATE"): (True, False, "Stated order is experimental arm first."),
        ("EXPERIMENTAL_FIRST", "INVERTED"): (False, False, "Stated order contradicts the arm data."),
        ("COMPARATOR_FIRST", "INVERTED"): (True, True, "Stated order and arm data agree: comparator first. Inverted."),
        ("COMPARATOR_FIRST", "INDETERMINATE"): (True, True, "Stated order is comparator first. Inverted."),
        ("COMPARATOR_FIRST", "SAME"): (False, False, "Stated order contradicts the arm data."),
        (None, "SAME"): (True, False, "Arm data match the reported sign: experimental arm first."),
        # Either the analysis is comparator-first or an arm value was posted with the wrong sign.
        # Nothing on the record says which, so the orientation is left unresolved.
        (None, "INVERTED"): (False, False, "Reported sign contradicts the arm data and the analysis states no order."),
        (None, "INDETERMINATE"): (False, False, "No stated order and the arm data cannot separate the two orders."),
    }
    resolved, flip, note = table[(hint, check)]
    chain.add(
        "normalize.direction", "direction.resolve",
        {"statedOrder": hint, "reported": theta, "armDerived": derived, "se": se, "armCheck": check},
        {"resolved": resolved, "inverted": flip}, note,
        outcome="PASS" if resolved else "FAIL",
    )
    return resolved, flip


def _arm_derived(measure: str, e: ArmSummary | None, k: ArmSummary | None) -> float | None:
    if e is None or k is None:
        return None
    if e.kind == "BINARY" and k.kind == "BINARY" and measure in ("OR", "RR", "HR", "RD"):
        if measure == "RD":
            return e.risk - k.risk  # type: ignore[operator]
        if not e.risk or not k.risk or e.risk >= 1 or k.risk >= 1:
            return None
        if measure == "OR":
            return math.log((e.risk / (1 - e.risk)) / (k.risk / (1 - k.risk)))
        return math.log(e.risk / k.risk)
    if e.kind == "CONTINUOUS" and k.kind == "CONTINUOUS" and measure == "MD":
        return e.mean - k.mean  # type: ignore[operator]
    return None


def _from_arms(c: Candidate, e: ArmSummary | None, k: ArmSummary | None, chain: Chain) -> Normalized:
    if e is None or k is None:
        return _fail(c, chain, "ARM_DATA_UNUSABLE", "Arm-level values, spreads or participant counts are missing.")
    n = e.n + k.n
    if e.kind == "BINARY" and k.kind == "BINARY":
        a, c0 = float(e.events), float(k.events)  # type: ignore[arg-type]
        if a == 0 and c0 == 0:
            return _fail(c, chain, "NO_EVENTS", "No events in either arm.")
        correction = 0.5 if 0 in (a, c0, e.n - a, k.n - c0) else 0.0
        a2, c2, n1, n2 = a + correction, c0 + correction, e.n + 2 * correction, k.n + 2 * correction
        theta = math.log((a2 / n1) / (c2 / n2))
        se = math.sqrt(1 / a2 - 1 / n1 + 1 / c2 - 1 / n2)
        chain.add(
            "normalize.derive", "derive.risk_ratio",
            {"eventsExperimental": a, "nExperimental": e.n, "eventsComparator": c0, "nComparator": k.n,
             "continuityCorrection": correction},
            {"logRR": theta, "se": se},
            "Risk ratio from arm counts. SE(log RR) = sqrt(1/a - 1/n1 + 1/c - 1/n2).",
        )
        effect = make_effect(
            "RR", theta, se, n=n, n_experimental=e.n, n_comparator=k.n, control_risk=k.risk,
            dispersion_type="ARM_LEVEL", direction_resolved=True,
        )
        return Normalized(ref=c.ref, ok=True, effect=effect, factors=chain.factors)
    if e.kind == "CONTINUOUS" and k.kind == "CONTINUOUS":
        if e.sd is None or k.sd is None:
            return _fail(c, chain, "ARM_DATA_UNUSABLE", "Arm-level dispersion cannot be turned into a standard deviation.")
        theta = e.mean - k.mean  # type: ignore[operator]
        se = math.sqrt(e.sd**2 / e.n + k.sd**2 / k.n)
        chain.add(
            "normalize.derive", "derive.mean_difference",
            {"meanExperimental": e.mean, "sdExperimental": e.sd, "nExperimental": e.n,
             "meanComparator": k.mean, "sdComparator": k.sd, "nComparator": k.n},
            {"md": theta, "se": se},
            "Mean difference from arm means. SE = sqrt(sd1^2/n1 + sd2^2/n2).",
        )
        effect = make_effect(
            "MD", theta, se, n=n, n_experimental=e.n, n_comparator=k.n, pooled_sd=pooled_sd(e, k),
            dispersion_type="ARM_LEVEL", direction_resolved=True,
        )
        return Normalized(ref=c.ref, ok=True, effect=effect, factors=chain.factors)
    return _fail(c, chain, "ARM_DATA_UNUSABLE", "Arms report different kinds of data.")


STORAGE_LIMIT = 1e9


def normalize(c: Candidate) -> Normalized:
    """Normalizes one candidate. Estimates too large to be an effect of that measure are rejected."""
    out = _normalize(c)
    e = out.effect
    if e is not None:
        numbers = [e.value, e.ci_low, e.ci_high, e.se, e.pooled_sd or 0.0]
        if any(not math.isfinite(x) or abs(x) >= STORAGE_LIMIT for x in numbers) or e.se <= 0:
            chain = Chain("NORMALIZE")
            chain.factors = list(out.factors)
            return _fail(c, chain, "OUT_OF_RANGE", "Estimate, interval or SE is not finite or exceeds 1e9.")
    return out


def _normalize(c: Candidate) -> Normalized:
    chain = Chain("NORMALIZE")
    e = summarize_arm(c.experimental, c.outcome_kind, c.arm_param, c.arm_dispersion, c.arm_ci_level)
    k = summarize_arm(c.comparator, c.outcome_kind, c.arm_param, c.arm_dispersion, c.arm_ci_level)

    if c.source_kind == "DERIVED_ARMS":
        return _from_arms(c, e, k, chain)

    measure = c.measure or ""
    if measure not in MEASURES:
        return _fail(c, chain, "UNSUPPORTED_MEASURE", f"Measure {measure!r} is not one Enigma stores.")
    if c.value is None or not math.isfinite(c.value):
        return _fail(c, chain, "NO_ESTIMATE", "The analysis has no numeric estimate.")

    value, lo, hi = c.value, c.ci_low, c.ci_high
    chain.add(
        "normalize.reported", "reported.verbatim",
        {"measure": measure, "value": value, "ciLow": lo, "ciHigh": hi, "ciLevel": c.ci_level,
         "pValue": c.p_value, "pValueModifier": c.p_value_modifier},
        measure, "Values as posted in outcome_analyses.",
    )
    if c.log_scale and is_ratio(measure):
        value = math.exp(value)
        lo = math.exp(lo) if lo is not None else None
        hi = math.exp(hi) if hi is not None else None
        chain.add("normalize.scale", "scale.exponentiate", {"reportedOnLogScale": True}, value,
                  "Reported on the log scale. Exponentiated.")
    if c.percent_points and measure == "RD":
        value, lo, hi = value / 100, (lo / 100 if lo is not None else None), (hi / 100 if hi is not None else None)
        chain.add("normalize.scale", "scale.percent_to_proportion", {"divisor": 100}, value,
                  "Risk difference reported in percentage points. Converted to a proportion.")
    if is_ratio(measure) and value <= 0:
        return _fail(c, chain, "INVALID_RATIO", "A ratio measure was reported as zero or negative.")

    probe = c.model_copy(update={"ci_low": lo, "ci_high": hi})
    found = _se_from_reported(probe, measure, value, chain)
    if found is None:
        return _fail(c, chain, "NO_UNCERTAINTY", "No usable interval, standard error or exact p-value.")
    se, dispersion = found
    theta = to_scale(measure, value)

    resolved, flip = _orientation(c, measure, theta, se, _arm_derived(measure, e, k), chain)
    if flip:
        theta = -theta

    n = (e.n + k.n) if (e and k) else ((c.experimental.n or 0) + (c.comparator.n or 0) if c.experimental and c.comparator else None)
    effect = make_effect(
        measure, theta, se, p_value=c.p_value if c.p_value_modifier in (None, "", "=") else None,
        n=n or None,
        n_experimental=c.experimental.n if c.experimental else None,
        n_comparator=c.comparator.n if c.comparator else None,
        control_risk=k.risk if k and k.kind == "BINARY" else None,
        pooled_sd=pooled_sd(e, k) if e and k and e.kind == "CONTINUOUS" and k.kind == "CONTINUOUS" else None,
        dispersion_type=dispersion, direction_resolved=resolved,
    )
    chain.add(
        "normalize.interval", "interval.rescale_to_95",
        {"se": se, "reportedLevel": c.ci_level}, {"ciLow": effect.ci_low, "ciHigh": effect.ci_high},
        "Interval recomputed at 95% from the SE so every record uses the same level.",
    )
    return Normalized(ref=c.ref, ok=True, effect=effect, factors=chain.factors)


# -------------------------------------------------------------- conversions


class ConversionError(ValueError):
    pass


def _risk(p0: float | None) -> float:
    if p0 is None or not 0 < p0 < 1:
        raise ConversionError("control risk is required and must be in (0, 1)")
    return p0


def _convert_value(source: str, target: str, x: float, p0: float | None, sd: float | None) -> float:
    """Converts a single natural-scale value. Every branch is monotone in x for fixed p0 / sd."""
    if source == target:
        return x
    pair = (source, target)
    if pair == ("OR", "RR"):
        p = _risk(p0)
        return x / (1 - p + p * x)
    if pair == ("RR", "OR"):
        p = _risk(p0)
        if x * p >= 1:
            raise ConversionError("risk ratio implies an experimental risk of 1 or more")
        return x * (1 - p) / (1 - x * p)
    if pair == ("RR", "RD"):
        return _risk(p0) * (x - 1)
    if pair == ("RD", "RR"):
        rr = 1 + x / _risk(p0)
        if rr <= 0:
            raise ConversionError("risk difference implies a negative experimental risk")
        return rr
    if pair == ("HR", "RR"):
        p = _risk(p0)
        return (1 - (1 - p) ** x) / p
    if pair == ("RR", "HR"):
        p = _risk(p0)
        if x * p >= 1:
            raise ConversionError("risk ratio implies an experimental risk of 1 or more")
        return math.log(1 - x * p) / math.log(1 - p)
    if pair == ("MD", "SMD"):
        if not sd or sd <= 0:
            raise ConversionError("pooled SD is required")
        return x / sd
    if pair == ("SMD", "MD"):
        if not sd or sd <= 0:
            raise ConversionError("pooled SD is required")
        return x * sd
    # two-step routes through RR
    if source in ("OR", "HR", "RD") and target in ("OR", "HR", "RD"):
        return _convert_value("RR", target, _convert_value(source, "RR", x, p0, sd), p0, sd)
    raise ConversionError(f"no conversion from {source} to {target}")


def convert(effect: Effect, target: str, chain: Chain | None = None) -> Effect:
    """Converts an effect to another measure. The interval limits are converted, then the SE re-derived."""
    if effect.measure == target:
        return effect
    p0, sd = effect.control_risk, effect.pooled_sd
    value = _convert_value(effect.measure, target, effect.value, p0, sd)
    lo = _convert_value(effect.measure, target, effect.ci_low, p0, sd)
    hi = _convert_value(effect.measure, target, effect.ci_high, p0, sd)
    lo, hi = min(lo, hi), max(lo, hi)
    z = float(norm.ppf(1 - (1 - effect.ci_level) / 2))
    se = (to_scale(target, hi) - to_scale(target, lo)) / (2 * z)
    out = effect.model_copy(
        update={
            "measure": target, "value": value, "ci_low": lo, "ci_high": hi, "se": se,
            "direction_convention": convention(target),
        }
    )
    if chain is not None:
        chain.add(
            "convert", f"convert.{effect.measure.lower()}_to_{target.lower()}",
            {"from": effect.measure, "value": effect.value, "controlRisk": p0, "pooledSd": sd},
            {"measure": target, "value": value, "ciLow": lo, "ciHigh": hi},
            f"{effect.measure} converted to {target} using the comparator-arm risk or pooled SD.",
        )
    return out


def convertible(source: str, target: str, a: Effect) -> bool:
    try:
        _convert_value(source, target, a.value, a.control_risk, a.pooled_sd)
        _convert_value(source, target, a.ci_low, a.control_risk, a.pooled_sd)
        _convert_value(source, target, a.ci_high, a.control_risk, a.pooled_sd)
        return True
    except (ConversionError, ValueError, ZeroDivisionError):
        return False
