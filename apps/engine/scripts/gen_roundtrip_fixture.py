"""Writes fixtures/effects_roundtrip_500.json: 500 effect records with a fixed seed.

    uv run python scripts/gen_roundtrip_fixture.py
"""

import json
import math
import random
from pathlib import Path

ROUTES = [("OR", "RR"), ("RR", "RD"), ("HR", "RR"), ("OR", "RD"), ("MD", "SMD")]


def main() -> None:
    rng = random.Random(20261011)
    records = []
    for i in range(500):
        source, target = ROUTES[i % len(ROUTES)]
        se = rng.uniform(0.03, 0.4)
        if source == "MD":
            theta = rng.uniform(-3, 3)
            value, lo, hi = theta, theta - 1.959964 * se, theta + 1.959964 * se
        else:
            theta = rng.uniform(-0.9, 0.9)
            value, lo, hi = (math.exp(x) for x in (theta, theta - 1.959964 * se, theta + 1.959964 * se))
        records.append(
            {
                "id": f"rt-{i:03d}",
                "source": source,
                "target": target,
                "value": value,
                "ciLow": lo,
                "ciHigh": hi,
                "se": se,
                "controlRisk": round(rng.uniform(0.01, 0.35), 4),
                "pooledSd": round(rng.uniform(0.5, 12), 4),
            }
        )
    out = Path(__file__).resolve().parents[3] / "fixtures" / "effects_roundtrip_500.json"
    out.write_text(json.dumps(records, indent=1) + "\n")
    print(f"wrote {len(records)} records to {out}")


if __name__ == "__main__":
    main()
