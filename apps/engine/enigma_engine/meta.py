"""Meta-analysis primitives: inverse-variance pooling, heterogeneity, cumulative
pooling and single-covariate meta-regression."""

from __future__ import annotations

import math

import numpy as np
from scipy.stats import chi2, norm

from .effects import Z95
from .models import Model


class Pooled(Model):
    k: int
    theta_fixed: float
    se_fixed: float
    theta_random: float
    se_random: float
    ci_low: float
    ci_high: float
    q: float
    df: int
    p_q: float
    i2: float
    tau2: float


def pool(thetas: list[float], ses: list[float]) -> Pooled:
    """DerSimonian-Laird random-effects pooling on the analysis scale."""
    y = np.asarray(thetas, dtype=float)
    v = np.asarray(ses, dtype=float) ** 2
    w = 1.0 / v
    k = len(y)
    fixed = float(np.sum(w * y) / np.sum(w))
    q = float(np.sum(w * (y - fixed) ** 2))
    df = k - 1
    c = float(np.sum(w) - np.sum(w**2) / np.sum(w))
    tau2 = max(0.0, (q - df) / c) if df > 0 and c > 0 else 0.0
    wr = 1.0 / (v + tau2)
    random = float(np.sum(wr * y) / np.sum(wr))
    se_random = float(math.sqrt(1.0 / np.sum(wr)))
    return Pooled(
        k=k,
        theta_fixed=fixed,
        se_fixed=float(math.sqrt(1.0 / np.sum(w))),
        theta_random=random,
        se_random=se_random,
        ci_low=random - Z95 * se_random,
        ci_high=random + Z95 * se_random,
        q=q,
        df=df,
        p_q=float(chi2.sf(q, df)) if df > 0 else 1.0,
        i2=max(0.0, (q - df) / q) if q > 0 and df > 0 else 0.0,
        tau2=tau2,
    )


class CumulativePoint(Model):
    index: int
    label: str
    date: str | None
    k: int
    theta: float
    ci_low: float
    ci_high: float
    z: float


def cumulative(thetas: list[float], ses: list[float], labels: list[str], dates: list[str | None]) -> list[CumulativePoint]:
    """Random-effects pooled estimate after each study is added, in the order given."""
    out: list[CumulativePoint] = []
    for i in range(1, len(thetas) + 1):
        p = pool(thetas[:i], ses[:i])
        out.append(
            CumulativePoint(
                index=i - 1, label=labels[i - 1], date=dates[i - 1], k=i, theta=p.theta_random,
                ci_low=p.ci_low, ci_high=p.ci_high, z=p.theta_random / p.se_random,
            )
        )
    return out


class ModeratorFit(Model):
    name: str
    k: int
    slope: float
    se: float
    p: float
    residual_q: float
    residual_i2: float
    # Share of the heterogeneity statistic the covariate removes.
    q_explained: float


def meta_regression(thetas: list[float], ses: list[float], x: list[float], name: str) -> ModeratorFit | None:
    """Fixed-effect weighted regression of the effect on one covariate. None when it cannot be fitted."""
    y = np.asarray(thetas, dtype=float)
    xs = np.asarray(x, dtype=float)
    w = 1.0 / np.asarray(ses, dtype=float) ** 2
    k = len(y)
    if k < 4 or float(np.ptp(xs)) == 0.0:
        return None
    xbar = float(np.sum(w * xs) / np.sum(w))
    ybar = float(np.sum(w * y) / np.sum(w))
    sxx = float(np.sum(w * (xs - xbar) ** 2))
    if sxx <= 0:
        return None
    slope = float(np.sum(w * (xs - xbar) * (y - ybar)) / sxx)
    intercept = ybar - slope * xbar
    residual_q = float(np.sum(w * (y - intercept - slope * xs) ** 2))
    total_q = float(np.sum(w * (y - ybar) ** 2))
    df = k - 2
    # Under residual heterogeneity the fixed-effect SE is too small. Inflate it by sqrt(Q_res / df).
    inflation = math.sqrt(max(1.0, residual_q / df))
    se = math.sqrt(1.0 / sxx) * inflation
    return ModeratorFit(
        name=name,
        k=k,
        slope=slope,
        se=se,
        p=float(2 * norm.sf(abs(slope / se))),
        residual_q=residual_q,
        residual_i2=max(0.0, (residual_q - df) / residual_q) if residual_q > 0 else 0.0,
        q_explained=max(0.0, 1 - residual_q / total_q) if total_q > 0 else 0.0,
    )
