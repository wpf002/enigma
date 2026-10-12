"""Diagnostic value ranking (ENIGMA_ROADMAP.md §6)."""

from __future__ import annotations

import math

from .models import Model
from .provenance import Chain, Factor

WEIGHTS = {
    "gateConfidence": 0.30,
    "severity": 0.25,
    "clusterWeight": 0.20,
    "unexplainedResidual": 0.15,
    "discriminability": 0.10,
    "alreadyResolved": -0.30,
}


class RankItem(Model):
    id: str
    gate_confidence: float
    severity: float
    # Participants across the trials the contradiction touches.
    patients: int
    unexplained_residual: float
    discriminability: float
    already_resolved: float


class Ranked(Model):
    id: str
    diagnostic_value: float
    components: dict[str, float]
    rank: int
    factors: list[Factor]


def rank(items: list[RankItem]) -> list[Ranked]:
    """Scores and orders contradictions. cluster_weight is log-scaled against the largest in the request."""
    largest = max((i.patients for i in items), default=0)
    scored: list[Ranked] = []
    for item in items:
        cluster_weight = math.log1p(item.patients) / math.log1p(largest) if largest > 0 else 0.0
        components = {
            "gateConfidence": item.gate_confidence,
            "severity": item.severity,
            "clusterWeight": cluster_weight,
            "unexplainedResidual": item.unexplained_residual,
            "discriminability": item.discriminability,
            "alreadyResolved": item.already_resolved,
        }
        raw = sum(WEIGHTS[k] * v for k, v in components.items())
        value = max(0.0, min(1.0, raw))
        chain = Chain("RANK")
        chain.add(
            "rank.cluster_weight", "rank.log_scaled_patients",
            {"patients": item.patients, "largestInCorpus": largest}, cluster_weight,
            "cluster_weight = ln(1 + patients) / ln(1 + largest).", score=cluster_weight,
        )
        chain.add(
            "rank.diagnostic_value", "rank.weighted_sum",
            {"components": components, "weights": WEIGHTS}, value,
            "0.30 gate_confidence + 0.25 severity + 0.20 cluster_weight + 0.15 unexplained_residual "
            "+ 0.10 discriminability - 0.30 already_resolved, clipped to [0, 1].",
            score=value,
        )
        scored.append(Ranked(id=item.id, diagnostic_value=round(value, 4),
                             components={k: round(v, 4) for k, v in components.items()}, rank=0, factors=chain.factors))
    scored.sort(key=lambda r: (-r.diagnostic_value, r.id))
    for i, r in enumerate(scored):
        r.rank = i + 1
    return scored
