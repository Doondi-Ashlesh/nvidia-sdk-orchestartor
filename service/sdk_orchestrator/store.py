"""Pluggable vector store — the grounding backend (D8).

Two backends behind one interface:

  numpy  (default, local dev) — zero-dependency brute-force cosine over a JSON
         file. Works everywhere including native Windows (milvus-lite is
         Linux/macOS only). Correct and fast for the dev corpus.

  milvus (production, Linux/Brev) — Milvus for cuVS-accelerated ANN at scale.
         Selected with VECTOR_BACKEND=milvus.

D8 (Milvus is the production grounding backend) is unchanged; this is just how
it's implemented so dev-on-Windows isn't blocked by milvus-lite's platform
limits. The agent's retrieval logic depends on this interface, not on Milvus.

Select the backend with the VECTOR_BACKEND env var (default: numpy).
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Protocol

import numpy as np

SERVICE_DIR = Path(__file__).resolve().parents[1]
DEFAULT_COLLECTION = "blueprints"


class VectorStore(Protocol):
    """Minimal interface both backends implement."""

    def reset(self, dim: int) -> None: ...
    def upsert(self, records: list[dict]) -> None: ...
    def search(self, query_vec: list[float], top_k: int) -> list[dict]: ...


# ──────────────────────────────────────────────────────────────────────
# numpy backend — local dev, zero infra
# ──────────────────────────────────────────────────────────────────────

class NumpyStore:
    """Brute-force cosine over a JSON-backed record list.

    record shape: {"id": str, "vector": list[float], "text": str, "source": str}
    """

    def __init__(self, path: Path | None = None):
        self.path = path or (SERVICE_DIR / "vectorstore.json")
        self._records: list[dict] = []
        if self.path.exists():
            self._records = json.loads(self.path.read_text(encoding="utf-8")).get("records", [])

    def reset(self, dim: int) -> None:  # dim unused; kept for interface parity
        self._records = []
        if self.path.exists():
            self.path.unlink()

    def upsert(self, records: list[dict]) -> None:
        # de-dup by id (last write wins), then persist
        by_id = {r["id"]: r for r in self._records}
        for r in records:
            by_id[r["id"]] = r
        self._records = list(by_id.values())
        self.path.write_text(
            json.dumps({"records": self._records}, ensure_ascii=False), encoding="utf-8"
        )

    def search(self, query_vec: list[float], top_k: int) -> list[dict]:
        if not self._records:
            return []
        mat = np.asarray([r["vector"] for r in self._records], dtype=np.float32)  # (N, D)
        q = np.asarray(query_vec, dtype=np.float32)                               # (D,)
        mat_n = mat / (np.linalg.norm(mat, axis=1, keepdims=True) + 1e-9)
        q_n = q / (np.linalg.norm(q) + 1e-9)
        sims = mat_n @ q_n                                                        # (N,)
        order = np.argsort(-sims)[:top_k]
        return [
            {
                "id": self._records[i]["id"],
                "score": round(float(sims[i]), 4),
                "source": self._records[i].get("source", ""),
                "text": self._records[i].get("text", ""),
            }
            for i in order
        ]


# ──────────────────────────────────────────────────────────────────────
# milvus backend — production / Linux / Brev
# ──────────────────────────────────────────────────────────────────────

class MilvusStore:
    """Milvus backend. pymilvus + milvus-lite (local) or a Milvus URI (remote)."""

    def __init__(self, uri: str | None = None, collection: str = DEFAULT_COLLECTION):
        from pymilvus import MilvusClient  # lazy — only imported when selected

        self.collection = collection
        self.uri = uri or os.environ.get("MILVUS_URI", str(SERVICE_DIR / "milvus.db"))
        self.client = MilvusClient(self.uri)

    def reset(self, dim: int) -> None:
        from pymilvus import DataType

        if self.client.has_collection(self.collection):
            self.client.drop_collection(self.collection)
        schema = self.client.create_schema(auto_id=False, enable_dynamic_field=True)
        schema.add_field("id", DataType.VARCHAR, is_primary=True, max_length=128)
        schema.add_field("vector", DataType.FLOAT_VECTOR, dim=dim)
        schema.add_field("text", DataType.VARCHAR, max_length=65535)
        schema.add_field("source", DataType.VARCHAR, max_length=512)
        idx = self.client.prepare_index_params()
        idx.add_index(field_name="vector", index_type="AUTOINDEX", metric_type="COSINE")
        self.client.create_collection(self.collection, schema=schema, index_params=idx)

    def upsert(self, records: list[dict]) -> None:
        rows = [
            {"id": r["id"], "vector": r["vector"], "text": r["text"][:65535], "source": r.get("source", "")}
            for r in records
        ]
        self.client.insert(self.collection, rows)

    def search(self, query_vec: list[float], top_k: int) -> list[dict]:
        hits = self.client.search(
            collection_name=self.collection,
            data=[query_vec],
            limit=top_k,
            output_fields=["id", "source", "text"],
        )[0]
        return [
            {
                "id": h["entity"]["id"],
                "score": round(float(h["distance"]), 4),
                "source": h["entity"].get("source", ""),
                "text": h["entity"].get("text", ""),
            }
            for h in hits
        ]


# ──────────────────────────────────────────────────────────────────────
# factory
# ──────────────────────────────────────────────────────────────────────

def get_store() -> VectorStore:
    """Return the configured backend. Default numpy (dev); milvus in prod."""
    backend = os.environ.get("VECTOR_BACKEND", "numpy").lower()
    if backend == "milvus":
        return MilvusStore()
    return NumpyStore()
