from fastapi import FastAPI

from enigma_engine import ENGINE_RULE_VERSION
from enigma_engine.contradiction import (
    ClusterInput, ClusterResult, PairInput, PairResult, analyze_cluster, benjamini_hochberg, classify_pair,
)
from enigma_engine.effects import Candidate, Normalized, normalize
from enigma_engine.gate import Edge, GateRecord, Population, Tuning, score_pair
from enigma_engine.models import Model
from enigma_engine.ranking import Ranked, RankItem, rank

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


class GateRequest(Model):
    tuning: Tuning = Tuning()
    records: list[GateRecord]
    # Population profile per trial, keyed by NCT id.
    populations: dict[str, Population]
    pairs: list[tuple[str, str]]


class GateResponse(Model):
    rule_version: str
    edges: list[Edge]


@app.post("/v1/gate/score", response_model=GateResponse)
def gate_score(req: GateRequest) -> GateResponse:
    records = {r.id: r for r in req.records}
    default = Population()
    edges = []
    for a_id, b_id in req.pairs:
        a, b = records[a_id], records[b_id]
        edges.append(score_pair(a, b, req.populations.get(a.nct_id, default), req.populations.get(b.nct_id, default), req.tuning))
    return GateResponse(rule_version=ENGINE_RULE_VERSION, edges=edges)


class PairsRequest(Model):
    tuning: Tuning = Tuning()
    items: list[PairInput]


class PairsResponse(Model):
    rule_version: str
    results: list[PairResult]


@app.post("/v1/contradictions/pairs", response_model=PairsResponse)
def contradiction_pairs(req: PairsRequest) -> PairsResponse:
    return PairsResponse(rule_version=ENGINE_RULE_VERSION, results=[classify_pair(p, req.tuning) for p in req.items])


class ClustersRequest(Model):
    tuning: Tuning = Tuning()
    clusters: list[ClusterInput]


class ClustersResponse(Model):
    rule_version: str
    results: list[ClusterResult]


@app.post("/v1/contradictions/clusters", response_model=ClustersResponse)
def contradiction_clusters(req: ClustersRequest) -> ClustersResponse:
    return ClustersResponse(rule_version=ENGINE_RULE_VERSION, results=[analyze_cluster(c, req.tuning) for c in req.clusters])


class RankRequest(Model):
    items: list[RankItem]


class RankResponse(Model):
    rule_version: str
    results: list[Ranked]


@app.post("/v1/rank", response_model=RankResponse)
def rank_contradictions(req: RankRequest) -> RankResponse:
    return RankResponse(rule_version=ENGINE_RULE_VERSION, results=rank(req.items))


class FdrRequest(Model):
    p_values: list[float]


class FdrResponse(Model):
    rule_version: str
    q_values: list[float]


@app.post("/v1/contradictions/fdr", response_model=FdrResponse)
def contradiction_fdr(req: FdrRequest) -> FdrResponse:
    """Benjamini-Hochberg q-values over every pair tested in a snapshot."""
    return FdrResponse(rule_version=ENGINE_RULE_VERSION, q_values=benjamini_hochberg(req.p_values))
