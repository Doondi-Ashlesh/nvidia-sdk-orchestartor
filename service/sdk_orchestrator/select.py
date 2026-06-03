"""Blueprint selection — pure retrieval logic, framework-agnostic.

Given a use case, embed it as a query, search the Milvus Lite blueprint
collection, and return ranked candidates. This is the SELECT step of the
architecture (the one genuinely-needed pre-agent retrieval, D8).

Deliberately NAT-free so it can be tested standalone:
    python -m sdk_orchestrator.select "HIPAA-compliant clinical chatbot"

The NAT @register_function wrapper lives in register.py and just calls this.
"""

from __future__ import annotations

import sys
from pathlib import Path

from pymilvus import MilvusClient

from sdk_orchestrator import nim

MILVUS_DB = Path(__file__).resolve().parents[1] / "milvus.db"
COLLECTION = "blueprints"


def select_blueprint(use_case: str, top_k: int = 3) -> dict:
    """Return ranked blueprint candidates for a use case.

    Output shape:
      {
        "use_case": "...",
        "candidates": [{"id": "enterprise-rag", "score": 0.71, "source": "..."}, ...],
        "best": "enterprise-rag" | None     # None if nothing clears the floor
      }

    A minimum-similarity floor avoids forcing a weak match — below it we return
    best=None so the agent generates from scratch rather than anchoring on an
    irrelevant blueprint (the lesson from prior over-eager matching).
    """
    if not MILVUS_DB.exists():
        raise FileNotFoundError(
            f"{MILVUS_DB} not found. Run `python -m sdk_orchestrator.ingest` first."
        )

    query_vec = nim.embed_query(use_case)
    client = MilvusClient(str(MILVUS_DB))
    hits = client.search(
        collection_name=COLLECTION,
        data=[query_vec],
        limit=top_k,
        output_fields=["id", "source"],
    )[0]

    candidates = [
        {
            "id": h["entity"]["id"],
            "score": round(float(h["distance"]), 4),  # COSINE similarity
            "source": h["entity"].get("source", ""),
        }
        for h in hits
    ]

    # Similarity floor — tunable. Below this, no blueprint is a real match.
    MATCH_FLOOR = 0.30
    best = candidates[0]["id"] if candidates and candidates[0]["score"] >= MATCH_FLOOR else None

    return {"use_case": use_case, "candidates": candidates, "best": best}


def _cli() -> int:
    if len(sys.argv) < 2:
        print('usage: python -m sdk_orchestrator.select "<use case>"', file=sys.stderr)
        return 2
    use_case = " ".join(sys.argv[1:])
    result = select_blueprint(use_case)
    import json

    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
