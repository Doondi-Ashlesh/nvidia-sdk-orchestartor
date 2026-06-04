"""Blueprint corpus ingestion into Milvus Lite — the grounding backbone (D8).

Reads NVIDIA AI Blueprint notebooks from data/blueprints/, embeds their
substantive content via hosted NIM (nv-embedqa-e5-v5), and stores the vectors
+ metadata in a local Milvus Lite collection. The agent's search_corpus tool
(Increment 1B) queries this collection to ground tailoring.

Why Milvus Lite: NVIDIA's recommended vector DB, embedded/file-backed for dev
(zero infra, free), same API as standalone/distributed Milvus for scale-out.

Run:
    cd service
    pip install -e .
    NVIDIA_NIM_API_KEY=nvapi-... python -m sdk_orchestrator.ingest

Output: ./milvus.db (a single file) with a populated `blueprints` collection.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from sdk_orchestrator import nim
from sdk_orchestrator.store import get_store

# data/blueprints/ lives at the repo root, one level up from service/
REPO_ROOT = Path(__file__).resolve().parents[2]
BLUEPRINTS_DIR = REPO_ROOT / "data" / "blueprints"
EMBED_DIM = 1024  # nv-embedqa-e5-v5 output dimension


def discover_blueprints() -> list[dict]:
    """Read the blueprint cards and build one grounding record per blueprint.

    Each card's title + description + domain + services is BOTH the embedding
    text (for SELECT matching) and the grounding text (plan.py reads it back to
    ground the architecture plan). Cards cover the full NVIDIA blueprint catalog
    — far more than the handful with full notebooks — so SELECT/PLAN work across
    every domain (RAG, fraud, video, drug discovery, retail, voice, etc.).

    Full notebooks (for GENERATE-step grounding) exist only for a subset and are
    handled separately; the rest ground on the card + the NVIDIA Skills catalog.
    """
    cards_path = BLUEPRINTS_DIR / "cards.json"
    if not cards_path.exists():
        raise FileNotFoundError(f"No cards.json at {cards_path} — the blueprint corpus.")
    cards = json.loads(cards_path.read_text(encoding="utf-8")).get("blueprints", [])
    records = []
    for c in cards:
        text = (
            f"{c['title']}. {c['description']} "
            f"Domain: {c['domain']}. "
            f"NVIDIA services: {', '.join(c['services'])}."
        )
        records.append({"id": c["id"], "text": text, "source": "cards.json"})
    return records


def main() -> int:
    print(f"Reading blueprints from {BLUEPRINTS_DIR}")
    records = discover_blueprints()
    if not records:
        print("No blueprints found to ingest.", file=sys.stderr)
        return 1
    print(f"Found {len(records)} blueprint(s): {[r['id'] for r in records]}")

    print("Embedding via hosted NIM (nv-embedqa-e5-v5)…")
    vectors = nim.embed([r["text"] for r in records])

    store = get_store()
    backend = type(store).__name__
    print(f"Writing to vector store ({backend})…")
    store.reset(dim=EMBED_DIM)
    store.upsert(
        [
            {"id": r["id"], "vector": v, "text": r["text"], "source": r["source"]}
            for r, v in zip(records, vectors)
        ]
    )
    print(f"Ingested {len(records)} blueprint(s) via {backend}. Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
