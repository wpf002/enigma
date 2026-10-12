from fastapi import FastAPI

from enigma_engine import ENGINE_RULE_VERSION
from enigma_engine.effects import Candidate, Normalized, normalize
from enigma_engine.models import Model

app = FastAPI(title="Enigma Engine", version=ENGINE_RULE_VERSION)


@app.get("/health")
def health() -> dict[str, object]:
    return {"ok": True, "service": "enigma-engine", "ruleVersion": ENGINE_RULE_VERSION}


class NormalizeRequest(Model):
    candidates: list[Candidate]


class NormalizeResponse(Model):
    rule_version: str
    results: list[Normalized]


@app.post("/v1/effects/normalize", response_model=NormalizeResponse)
def normalize_effects(req: NormalizeRequest) -> NormalizeResponse:
    return NormalizeResponse(rule_version=ENGINE_RULE_VERSION, results=[normalize(c) for c in req.candidates])
