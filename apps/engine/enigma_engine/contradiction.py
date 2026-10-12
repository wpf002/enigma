"""Contradiction classification (ENIGMA_ROADMAP.md §5).

Runs only on pairs and clusters that passed the comparability gate. The caller
enforces that; these functions refuse a pair whose gate score is below threshold.

  C1  direction conflict          opposite directions, both intervals exclude the null
  C2  magnitude incompatibility   same direction, disjoint intervals, |z of difference| > 1.96
  C3  null / effect conflict      one interval excludes the null, the other includes the null
                                  and excludes the first point estimate, |z of difference| > 1.96
  C4  heterogeneity anomaly       cluster I2 above threshold, no moderator accounts for it
  C5  temporal reversal           cumulative pooled estimate changes side of the null after
                                  its interval had excluded the null
"""

from __future__ import annotations

import math
from typing import Any, Literal

from scipy.stats import norm

from .effects import Z95, Effect, convert, from_scale, to_scale
from .gate import GateRecord, Population, Tuning, population_scores
from .meta import CumulativePoint, ModeratorFit, Pooled, cumulative, meta_regression, pool
from .models import Model
from .provenance import Chain, Factor, Threshold


class GateNotPassed(ValueError):
    pass


class Discriminator(Model):
    basis: Literal["MEASURED", "UNIDENTIFIED"]
    name: str
    a: str | None = None
    b: str | None = None
    # Normalized size of the difference, 0..1.
    weight: float = 0.0


class TrialMeta(Model):
    status: str | None = None
    stop_category: str | None = None
    completion_date: str | None = None
    sponsor_class: str | None = None
    acronym: str | None = None


class PairInput(Model):
    edge_id: str
    gate_score: float
    common_measure: str
    dimension_scores: dict[str, float]
    a: GateRecord
    b: GateRecord
    population_a: Population = Population()
    population_b: Population = Population()
    trial_a: TrialMeta = TrialMeta()
    trial_b: TrialMeta = TrialMeta()


class EffectOut(Model):
    measure: str
    value: float
    ci_low: float
    ci_high: float
    ci_level: float = 0.95
    se: float


class PairResult(Model):
    edge_id: str
    type: Literal["C1", "C2", "C3"] | None
    severity: float | None = None
    z_diff: float
    p_diff: float
    a: EffectOut
    b: EffectOut
    unexplained_residual: float
    discriminability: float
    discriminator: Discriminator
    factors: list[Factor]


def _out(e: Effect) -> EffectOut:
    return EffectOut(measure=e.measure, value=e.value, ci_low=e.ci_low, ci_high=e.ci_high, se=e.se)


def _saturate(x: float, scale: float) -> float:
    """0 at x <= 0, approaching 1 as x grows."""
    return 0.0 if x <= 0 else 1.0 - math.exp(-x / scale)


def _fmt_days(d: int | None) -> str | None:
    if not d:
        return None
    return f"{d / 365.25:.1f} years" if d >= 540 else f"{round(d / 7)} weeks"


def discriminating_variable(p: PairInput) -> Discriminator:
    """The recorded covariate that differs most between two comparable results, if any does."""
    a, b = p.a, p.b
    c: list[Discriminator] = []

    def add(name: str, va: Any, vb: Any, weight: float) -> None:
        if weight > 0:
            c.append(Discriminator(basis="MEASURED", name=name, a=None if va is None else str(va),
                                   b=None if vb is None else str(vb), weight=round(min(1.0, weight), 4)))

    if a.dose_daily and b.dose_daily and a.dose_unit == b.dose_unit and a.dose_daily != b.dose_daily:
        ratio = min(a.dose_daily, b.dose_daily) / max(a.dose_daily, b.dose_daily)
        add("dose", f"{a.dose_daily:g} {a.dose_unit}/day", f"{b.dose_daily:g} {b.dose_unit}/day", (1 - ratio) * 2)
    if a.timepoint_days and b.timepoint_days and a.timepoint_days != b.timepoint_days:
        ratio = min(a.timepoint_days, b.timepoint_days) / max(a.timepoint_days, b.timepoint_days)
        add("follow-up length", _fmt_days(a.timepoint_days), _fmt_days(b.timepoint_days), (1 - ratio) * 1.5)

    pa, pb = p.population_a, p.population_b
    sub = population_scores(pa, pb)
    if pa.baseline.hba1c_mean is not None and pb.baseline.hba1c_mean is not None:
        add("baseline HbA1c", f"{pa.baseline.hba1c_mean:.1f}%", f"{pb.baseline.hba1c_mean:.1f}%",
            abs(pa.baseline.hba1c_mean - pb.baseline.hba1c_mean) / 1.5)
    if pa.baseline.age_mean is not None and pb.baseline.age_mean is not None:
        add("baseline age", f"{pa.baseline.age_mean:.0f} years", f"{pb.baseline.age_mean:.0f} years",
            abs(pa.baseline.age_mean - pb.baseline.age_mean) / 15)
    if pa.background != pb.background and "UNSPECIFIED" not in (pa.background, pb.background):
        add("background therapy", pa.background, pb.background, (1 - sub["background"]) * 2)
    if "hba1cRange" in sub and sub["hba1cRange"] < 1:
        add("HbA1c inclusion range", f"{pa.hba1c_min or '-'} to {pa.hba1c_max or '-'}%",
            f"{pb.hba1c_min or '-'} to {pb.hba1c_max or '-'}%", 1 - sub["hba1cRange"])
    if a.analysis_population != b.analysis_population and "UNKNOWN" not in (a.analysis_population, b.analysis_population):
        add("analysis population", a.analysis_population, b.analysis_population, 0.5)
    if a.comparator_class != b.comparator_class:
        add("comparator", a.comparator_class, b.comparator_class, 0.6)
    ta, tb = p.trial_a, p.trial_b
    if (ta.status == "TERMINATED") != (tb.status == "TERMINATED"):
        add("early termination", f"{ta.status} ({ta.stop_category or 'n/a'})", f"{tb.status} ({tb.stop_category or 'n/a'})", 0.7)
    if ta.sponsor_class and tb.sponsor_class and (ta.sponsor_class == "INDUSTRY") != (tb.sponsor_class == "INDUSTRY"):
        add("sponsor type", ta.sponsor_class, tb.sponsor_class, 0.3)
    if ta.completion_date and tb.completion_date:
        years = abs(int(ta.completion_date[:4]) - int(tb.completion_date[:4]))
        add("completion year", ta.completion_date[:4], tb.completion_date[:4], years / 12)

    c = [d for d in c if d.weight >= 0.1]
    if not c:
        return Discriminator(basis="UNIDENTIFIED", name="unidentified")
    return max(c, key=lambda d: d.weight)


def classify_pair(p: PairInput, t: Tuning) -> PairResult:
    if p.gate_score < t.gate_threshold:
        raise GateNotPassed(f"edge {p.edge_id} has gate score {p.gate_score} below {t.gate_threshold}")
    chain = Chain("CONTRADICTION")
    ea = convert(p.a.effect(), p.common_measure, chain)
    eb = convert(p.b.effect(), p.common_measure, chain)
    ta, tb, sa, sb = ea.theta, eb.theta, ea.se, eb.se
    la, ha, lb, hb = ta - Z95 * sa, ta + Z95 * sa, tb - Z95 * sb, tb + Z95 * sb
    excl_a, excl_b = la > 0 or ha < 0, lb > 0 or hb < 0
    z_diff = (ta - tb) / math.sqrt(sa**2 + sb**2)
    p_diff = float(2 * norm.sf(abs(z_diff)))
    za, zb = ta / sa, tb / sb
    disjoint = ha < lb or hb < la

    chain.add(
        "contradiction.difference", "difference.z_test",
        {"measure": p.common_measure, "thetaA": ta, "seA": sa, "thetaB": tb, "seB": sb},
        {"zDiff": z_diff, "pDiff": p_diff},
        "z = (thetaA - thetaB) / sqrt(seA^2 + seB^2) on the analysis scale.",
    )

    kind: Literal["C1", "C2", "C3"] | None = None
    severity: float | None = None
    rule, note, inputs = "classify.none", "The two intervals are statistically compatible.", {}
    if excl_a and excl_b and ta * tb < 0:
        kind = "C1"
        weaker = min(abs(za), abs(zb))
        severity = 0.5 + 0.5 * _saturate(weaker - Z95, 1.5)
        rule, inputs = "classify.c1_direction_conflict", {"zA": za, "zB": zb, "weakerZ": weaker}
        note = "Opposite directions and both intervals exclude the null. Severity = 0.5 + 0.5 * (1 - exp(-(weaker |z| - 1.96) / 1.5))."
    elif excl_a != excl_b:
        sig_theta, null_lo, null_hi, null_se, sig_z = (ta, lb, hb, sb, za) if excl_a else (tb, la, ha, sa, zb)
        null_theta = tb if excl_a else ta
        # The roadmap definition ignores the uncertainty of the significant estimate. Requiring
        # |z of difference| > 1.96 keeps pairs that are statistically compatible out of C3.
        if (sig_theta < null_lo or sig_theta > null_hi) and abs(z_diff) > Z95:
            kind = "C3"
            beyond = abs(sig_theta - null_theta) / null_se - Z95
            limiting = min(beyond, abs(sig_z) - Z95)
            severity = 0.3 + 0.6 * _saturate(limiting, 1.5)
            rule = "classify.c3_null_effect_conflict"
            inputs = {"effectSide": "A" if excl_a else "B", "effectZ": sig_z, "seBeyondNullInterval": beyond}
            note = ("One interval excludes the null. The other includes the null and excludes the first point estimate, "
                    "and |z of difference| > 1.96. "
                    "Severity = 0.3 + 0.6 * (1 - exp(-min(distance beyond interval, effect |z| - 1.96) / 1.5)).")
    elif excl_a and excl_b and disjoint and abs(z_diff) > Z95:
        kind = "C2"
        severity = 0.15 + 0.6 * _saturate(abs(z_diff) - Z95, 2.0)
        rule, inputs = "classify.c2_magnitude_incompatibility", {"zDiff": z_diff, "intervalsDisjoint": True}
        note = "Same direction, disjoint intervals, |z of difference| > 1.96. Severity = 0.15 + 0.6 * (1 - exp(-(|z| - 1.96) / 2))."

    chain.add(
        "contradiction.classify", rule,
        {"ciA": [from_scale(p.common_measure, la), from_scale(p.common_measure, ha)],
         "ciB": [from_scale(p.common_measure, lb), from_scale(p.common_measure, hb)],
         "excludesNullA": excl_a, "excludesNullB": excl_b, **inputs},
        kind, note, score=severity, outcome="FAIL" if kind else "PASS",
        threshold=Threshold(name="z95", value=round(Z95, 4), op=">"),
    )

    residual = 1.0
    for score in p.dimension_scores.values():
        residual *= score
    disc = discriminating_variable(p)
    if kind:
        chain.add(
            "contradiction.unexplained_residual", "residual.product_of_dimension_scores",
            {"dimensionScores": p.dimension_scores}, residual,
            "Product of the eight gate scores. 1.0 means no recorded design difference is left to explain the conflict.",
            score=residual,
        )
        chain.add(
            "contradiction.discriminating_variable", "discriminator.largest_measured_difference",
            {"basis": disc.basis, "a": disc.a, "b": disc.b, "weight": disc.weight}, disc.name,
            "The recorded covariate with the largest normalized difference between A and B."
            if disc.basis == "MEASURED" else "No recorded covariate differs between A and B.",
            score=1.0 if disc.basis == "MEASURED" else 0.0,
        )
    return PairResult(
        edge_id=p.edge_id, type=kind, severity=None if severity is None else round(severity, 4),
        z_diff=z_diff, p_diff=p_diff, a=_out(ea), b=_out(eb),
        unexplained_residual=round(residual, 4), discriminability=1.0 if disc.basis == "MEASURED" else 0.0,
        discriminator=disc, factors=chain.factors,
    )


def benjamini_hochberg(p_values: list[float]) -> list[float]:
    """Benjamini-Hochberg adjusted p-values (q-values), in the order given."""
    m = len(p_values)
    order = sorted(range(m), key=lambda i: p_values[i])
    q = [1.0] * m
    running = 1.0
    for rank_from_end, i in enumerate(reversed(order)):
        rank = m - rank_from_end
        running = min(running, p_values[i] * m / rank)
        q[i] = running
    return q


# -------------------------------------------------------------------- clusters


class Member(Model):
    record: GateRecord
    label: str
    completion_date: str | None = None
    # Candidate moderators: name -> value. Missing values are omitted.
    moderators: dict[str, float] = {}


class ClusterInput(Model):
    key: str
    common_measure: str
    density: float
    members: list[Member]


class ClusterFinding(Model):
    type: Literal["C4", "C5"]
    severity: float
    unexplained_residual: float
    discriminability: float
    discriminator: Discriminator
    a_label: str
    b_label: str
    a_nct_ids: list[str]
    b_nct_ids: list[str]
    a: EffectOut
    b: EffectOut
    factors: list[Factor]


class ClusterResult(Model):
    key: str
    k: int
    n_patients: int
    measure: str
    pooled: Pooled | None = None
    cumulative: list[CumulativePoint] = []
    moderators: list[ModeratorFit] = []
    dropped: list[str] = []
    findings: list[ClusterFinding] = []


MIN_CLUSTER_K = 3
MIN_CLUSTER_DENSITY = 0.5


def _pooled_effect(measure: str, theta: float, lo: float, hi: float) -> EffectOut:
    return EffectOut(measure=measure, value=from_scale(measure, theta), ci_low=from_scale(measure, lo),
                     ci_high=from_scale(measure, hi), se=(hi - lo) / (2 * Z95))


def analyze_cluster(c: ClusterInput, t: Tuning) -> ClusterResult:
    effects: list[tuple[Member, Effect]] = []
    dropped: list[str] = []
    for m in c.members:
        try:
            effects.append((m, convert(m.record.effect(), c.common_measure)))
        except ValueError:
            dropped.append(m.record.id)
    # calendar order, undated studies last
    effects.sort(key=lambda me: (me[0].completion_date is None, me[0].completion_date or ""))
    k = len(effects)
    n_patients = sum(m.record.n or 0 for m, _ in effects)
    out = ClusterResult(key=c.key, k=k, n_patients=n_patients, measure=c.common_measure, dropped=dropped)
    if k < 2:
        return out
    thetas = [e.theta for _, e in effects]
    ses = [e.se for _, e in effects]
    labels = [m.label for m, _ in effects]
    dates = [m.completion_date for m, _ in effects]
    pooled = pool(thetas, ses)
    out.pooled = pooled
    out.cumulative = cumulative(thetas, ses, labels, dates)

    names = sorted({name for m, _ in effects for name in m.moderators})
    for name in names:
        have = [(e.theta, e.se, m.moderators[name]) for m, e in effects if name in m.moderators]
        if len(have) < max(4, k - 1):
            continue
        fit = meta_regression([h[0] for h in have], [h[1] for h in have], [h[2] for h in have], name)
        if fit:
            out.moderators.append(fit)

    if k < MIN_CLUSTER_K or c.density < MIN_CLUSTER_DENSITY:
        return out

    # ---- C4: heterogeneity anomaly
    if pooled.i2 >= t.i2_threshold and pooled.p_q < 0.10:
        explaining = [f for f in out.moderators if f.p < 0.05 and f.residual_i2 < t.i2_threshold]
        chain = Chain("CONTRADICTION")
        chain.add(
            "contradiction.heterogeneity", "heterogeneity.dersimonian_laird",
            {"k": k, "q": pooled.q, "df": pooled.df, "pQ": pooled.p_q, "tau2": pooled.tau2}, pooled.i2,
            "I2 = (Q - df) / Q across the cluster.", score=pooled.i2,
            outcome="FAIL", threshold=Threshold(name="i2Threshold", value=t.i2_threshold, op=">="),
        )
        chain.add(
            "contradiction.moderators", "moderators.meta_regression",
            {"tested": [{"name": f.name, "p": f.p, "residualI2": f.residual_i2} for f in out.moderators]},
            [f.name for f in explaining],
            "A moderator accounts for the heterogeneity when its slope has p < 0.05 and the residual I2 falls below threshold.",
            outcome="PASS" if explaining else "FAIL",
        )
        if not explaining:
            # the two members furthest apart carry the claim
            best = (0.0, 0, 1)
            for i in range(k):
                for j in range(i + 1, k):
                    z = abs(thetas[i] - thetas[j]) / math.sqrt(ses[i] ** 2 + ses[j] ** 2)
                    if z > best[0]:
                        best = (z, i, j)
            _, i, j = best
            residual = min([f.residual_i2 for f in out.moderators], default=pooled.i2)
            partial = min(out.moderators, key=lambda f: f.p, default=None)
            severity = 0.2 + 0.6 * ((pooled.i2 - t.i2_threshold) / (1 - t.i2_threshold)) * min(1.0, k / 6)
            chain.add(
                "contradiction.classify", "classify.c4_heterogeneity_anomaly",
                {"i2": pooled.i2, "k": k, "residualI2": residual, "mostDiscordantZ": best[0]}, "C4",
                "I2 above threshold and no tested moderator accounts for it. "
                "Severity = 0.2 + 0.6 * (I2 - threshold) / (1 - threshold) * min(1, k / 6).",
                score=severity, outcome="FAIL",
            )
            disc = (
                Discriminator(
                    basis="MEASURED", weight=partial.q_explained,
                    name=f"{partial.name}, which accounts for part of the spread (slope p {'< 0.01' if partial.p < 0.01 else f'= {partial.p:.2f}'})",
                )
                if partial and partial.p < 0.2 else Discriminator(basis="UNIDENTIFIED", name="unidentified")
            )
            out.findings.append(
                ClusterFinding(
                    type="C4", severity=round(severity, 4), unexplained_residual=round(residual, 4),
                    discriminability=0.5 if disc.basis == "MEASURED" else 0.0, discriminator=disc,
                    a_label=labels[i], b_label=labels[j],
                    a_nct_ids=[effects[i][0].record.nct_id], b_nct_ids=[effects[j][0].record.nct_id],
                    a=_out(effects[i][1]), b=_out(effects[j][1]), factors=chain.factors,
                )
            )

    # ---- C5: temporal reversal of the cumulative pooled estimate
    dated = [p for p in out.cumulative if p.date]
    first = next((p for p in dated if p.k >= 2 and (p.ci_low > 0 or p.ci_high < 0)), None)
    if first:
        later = next((p for p in dated if p.index > first.index and p.theta * first.theta < 0), None)
        if later:
            full = later.ci_low > 0 or later.ci_high < 0
            severity = 0.3 + 0.3 * _saturate(abs(first.z) - Z95, 1.5) + (0.4 if full else 0.0)
            chain = Chain("CONTRADICTION")
            chain.add(
                "contradiction.cumulative", "cumulative.random_effects_by_completion_date",
                {"series": [{"date": p.date, "k": p.k, "theta": p.theta, "ciLow": p.ci_low, "ciHigh": p.ci_high} for p in dated]},
                {"firstExcludesNullAt": first.date, "crossesAt": later.date},
                "Random-effects pooled estimate recomputed as each trial completes.",
            )
            chain.add(
                "contradiction.classify", "classify.c5_temporal_reversal",
                {"zAtFirst": first.z, "thetaAtFirst": first.theta, "thetaAtLater": later.theta, "laterExcludesNull": full}, "C5",
                "The pooled interval excluded the null, then the pooled estimate moved to the other side. "
                "Severity = 0.3 + 0.3 * (1 - exp(-(|z| - 1.96) / 1.5)) + 0.4 if the later interval also excludes the null.",
                score=severity, outcome="FAIL",
            )
            added = [labels[p.index] for p in dated if first.index < p.index <= later.index]
            out.findings.append(
                ClusterFinding(
                    type="C5", severity=round(min(1.0, severity), 4), unexplained_residual=round(pooled.i2, 4),
                    discriminability=0.5,
                    discriminator=Discriminator(basis="MEASURED", name="trials completed in the interval",
                                                a=f"through {first.date[:7]}", b=f"through {later.date[:7]}", weight=0.5),
                    a_label=f"Pooled estimate of {first.k} trials through {first.date[:7]}",
                    b_label=f"Pooled estimate of {later.k} trials through {later.date[:7]} (adds {', '.join(added)})",
                    a_nct_ids=[effects[q][0].record.nct_id for q in range(first.index + 1)],
                    b_nct_ids=[effects[q][0].record.nct_id for q in range(later.index + 1)],
                    a=_pooled_effect(c.common_measure, first.theta, first.ci_low, first.ci_high),
                    b=_pooled_effect(c.common_measure, later.theta, later.ci_low, later.ci_high),
                    factors=chain.factors,
                )
            )
    return out


__all__ = ["ClusterInput", "ClusterResult", "PairInput", "PairResult", "analyze_cluster", "classify_pair", "to_scale"]
