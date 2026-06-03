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

from pymilvus import DataType, MilvusClient

from sdk_orchestrator import nim

# data/blueprints/ lives at the repo root, one level up from service/
REPO_ROOT = Path(__file__).resolve().parents[2]
BLUEPRINTS_DIR = REPO_ROOT / "data" / "blueprints"
MILVUS_DB = Path(__file__).resolve().parents[1] / "milvus.db"
COLLECTION = "blueprints"
EMBED_DIM = 1024  # nv-embedqa-e5-v5 output dimension


def extract_blueprint_text(ipynb_path: Path) -> str:
    """Pull the substantive text from a blueprint notebook for embedding.

    Concatenate markdown cells (the narrative — what the blueprint is for) and
    the first line of each code cell (the API surface signal). We deliberately
    do NOT embed full code bodies: the retrieval signal we want is "what is this
    blueprint about and which services does it use," not raw implementation.
    """
    nb = json.loads(ipynb_path.read_text(encoding="utf-8"))
    parts: list[str] = []
    for cell in nb.get("cells", []):
        src = cell.get("source", "")
        if isinstance(src, list):
            src = "".join(src)
        if cell.get("cell_type") == "markdown":
            parts.append(src)
        elif cell.get("cell_type") == "code":
            first = next((ln for ln in src.splitlines() if ln.strip()), "")
            if first:
                parts.append(first)
    return "\n".join(parts).strip()


def discover_blueprints() -> list[dict]:
    """Find blueprint notebooks and derive id + content."""
    if not BLUEPRINTS_DIR.exists():
        raise FileNotFoundError(f"No blueprints dir at {BLUEPRINTS_DIR}")
    records = []
    for ipynb in sorted(BLUEPRINTS_DIR.glob("*.ipynb")):
        bp_id = ipynb.stem  # e.g. "enterprise-rag", "fraud-detection"
        text = extract_blueprint_text(ipynb)
        if not text:
            print(f"  ! skipping {bp_id} (no extractable text)", file=sys.stderr)
            continue
        records.append({"id": bp_id, "text": text, "source": str(ipynb.name)})
    return records


def build_collection(client: MilvusClient) -> None:
    """(Re)create the blueprints collection with an explicit schema."""
    if client.has_collection(COLLECTION):
        client.drop_collection(COLLECTION)
    schema = client.create_schema(auto_id=False, enable_dynamic_field=True)
    schema.add_field("id", DataType.VARCHAR, is_primary=True, max_length=128)
    schema.add_field("vector", DataType.FLOAT_VECTOR, dim=EMBED_DIM)
    schema.add_field("text", DataType.VARCHAR, max_length=65535)
    schema.add_field("source", DataType.VARCHAR, max_length=512)
    index = client.prepare_index_params()
    index.add_index(field_name="vector", index_type="AUTOINDEX", metric_type="COSINE")
    client.create_collection(COLLECTION, schema=schema, index_params=index)


def main() -> int:
    print(f"Reading blueprints from {BLUEPRINTS_DIR}")
    records = discover_blueprints()
    if not records:
        print("No blueprints found to ingest.", file=sys.stderr)
        return 1
    print(f"Found {len(records)} blueprint(s): {[r['id'] for r in records]}")

    print("Embedding via hosted NIM (nv-embedqa-e5-v5)…")
    vectors = nim.embed([r["text"] for r in records])

    print(f"Writing to Milvus Lite at {MILVUS_DB}")
    client = MilvusClient(str(MILVUS_DB))
    build_collection(client)
    rows = [
        {"id": r["id"], "vector": v, "text": r["text"][:65535], "source": r["source"]}
        for r, v in zip(records, vectors)
    ]
    client.insert(COLLECTION, rows)
    print(f"Ingested {len(rows)} blueprint(s) into collection '{COLLECTION}'. Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
