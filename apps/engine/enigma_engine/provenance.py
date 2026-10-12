"""Factor chain. Mirrors packages/provenance/src/factor.ts."""

from typing import Any, Literal

from . import ENGINE_RULE_VERSION
from .models import Model

Stage = Literal["NORMALIZE", "HARMONIZE", "GATE", "CONTRADICTION", "RANK"]
Outcome = Literal["PASS", "FAIL", "INFO"]


class Threshold(Model):
    name: str
    value: float
    op: Literal[">=", "<=", ">", "<", "=="]


class Factor(Model):
    seq: int
    stage: Stage
    name: str
    rule: str
    rule_version: str
    inputs: dict[str, Any]
    threshold: Threshold | None = None
    output: Any = None
    score: float | None = None
    outcome: Outcome = "INFO"
    note: str


def _clean(value: Any) -> Any:
    """Rounds floats so stored chains are stable and readable."""
    if isinstance(value, float):
        return float(f"{value:.6g}")
    if isinstance(value, dict):
        return {k: _clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_clean(v) for v in value]
    return value


class Chain:
    def __init__(self, stage: Stage) -> None:
        self.stage: Stage = stage
        self.factors: list[Factor] = []

    def add(
        self,
        name: str,
        rule: str,
        inputs: dict[str, Any],
        output: Any,
        note: str,
        *,
        score: float | None = None,
        outcome: Outcome = "INFO",
        threshold: Threshold | None = None,
    ) -> Factor:
        factor = Factor(
            seq=len(self.factors) + 1,
            stage=self.stage,
            name=name,
            rule=rule,
            rule_version=ENGINE_RULE_VERSION,
            inputs=_clean(inputs),
            threshold=threshold,
            output=_clean(output),
            score=None if score is None else round(score, 4),
            outcome=outcome,
            note=note,
        )
        self.factors.append(factor)
        return factor
