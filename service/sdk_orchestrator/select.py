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

from sdk_orchestrator import nim
from sdk_orchestrator.store import get_store

# Similarity floor — below this, no blueprint is a real match and the agent
# should generate from scratch rather than anchor on an irrelevant blueprint
# (the lesson from prior over-eager matching). Tunable.
MATCH_FLOOR = 0.30


def select_blueprint(use_case: str, top_k: int = 3) -> dict:
    """Return ranked blueprint candidates for a use case.

    Output shape:
      {
        "use_case": "...",
        "candidates": [{"id": "enterprise-rag", "score": 0.71, "source": "..."}, ...],
        "best": "enterprise-rag" | None     # None if nothing clears the floor
      }
    """
    query_vec = nim.embed_query(use_case)
    store = get_store()
    hits = store.search(query_vec, top_k=top_k)

    candidates = [
        {"id": h["id"], "score": h["score"], "source": h.get("source", "")}
        for h in hits
    ]
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
