"""Architecture planning — the PLAN step of tailoring (Phase 2A).

Given a use case (and the selected blueprint as grounding), Nemotron produces
the tailored architecture: which NVIDIA services, their roles, and the data
flow between them. This output IS the architecture-manifest skeleton the
visualizer renders (services + connections); the per-section cell generation
(Phase 2B) later fills in cellRefs + verification.

Plan-then-generate mirrors the AI-Q pattern: a structured plan first, then
execution against it. Constrained JSON output (D5) avoids post-hoc parsing.

Test standalone (no NAT):
    python -m sdk_orchestrator.plan "HIPAA-compliant clinical chatbot"
"""

from __future__ import annotations

import json
import sys

from sdk_orchestrator import catalog, nim
from sdk_orchestrator.select import select_blueprint
from sdk_orchestrator.store import get_store

PLAN_SYSTEM_PROMPT = """You are a senior NVIDIA AI solutions architect.

Given a user's use case and a reference NVIDIA AI Blueprint, produce the
tailored solution ARCHITECTURE as JSON. Choose only services that genuinely
belong in the data flow for THIS use case — do not include a service you
cannot place with concrete inputs and outputs.

Return ONLY a JSON object of this exact shape:
{
  "services": [
    {"id": "<catalog id>", "role": "<what this service does in THIS solution>"}
  ],
  "connections": [
    {"from": "<catalog id>", "to": "<catalog id>", "data": "<what flows>"}
  ]
}

Use ONLY these service ids (id: name (layer)):
%s

Rules:
- 5 to 10 services. Order them along the data flow.
- Every connection's from/to must be ids present in your services list.
- role is specific to the use case, not the generic service description.
- Output valid JSON only. No prose, no markdown fences.
"""


def _extract_json(raw: str) -> dict:
    """Parse JSON from model output, tolerating markdown fences / leading text.

    json_mode usually returns clean JSON, but this is defensive: strips ```json
    fences, and falls back to the outermost {...} block if a direct parse fails.
    """
    raw = raw.strip()
    if raw.startswith("```"):
        # ```json\n{...}\n```  ->  {...}
        inner = raw.split("```", 2)
        raw = (inner[1] if len(inner) > 1 else raw).removeprefix("json").strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(raw[start : end + 1])
            except json.JSONDecodeError:
                pass
    return {}


def _load_blueprint_text(blueprint_id: str) -> str:
    """Pull the blueprint's stored text from the vector store for grounding."""
    store = get_store()
    # search by the blueprint's own id text is overkill; read the record.
    # NumpyStore/MilvusStore both expose search; we do a cheap exact lookup by
    # re-reading the store file for numpy, else a permissive search.
    for rec in getattr(store, "_records", []):
        if rec.get("id") == blueprint_id:
            return rec.get("text", "")
    return ""


def plan_architecture(use_case: str, blueprint_id: str | None = None) -> dict:
    """Produce the architecture-manifest skeleton for a use case.

    Returns:
      {
        "use_case": "...",
        "blueprint_id": "enterprise-rag" | None,
        "services": [{"id","name","role","layer"}],
        "connections": [{"from","to","data"}],
        "dropped": ["<ids the model proposed that aren't in the catalog>"]
      }
    """
    # 1. Select the grounding blueprint if not supplied.
    if blueprint_id is None:
        sel = select_blueprint(use_case, top_k=1)
        blueprint_id = sel["best"]

    blueprint_text = _load_blueprint_text(blueprint_id) if blueprint_id else ""

    # 2. Ask Nemotron for the architecture as constrained JSON.
    user = f"USE CASE:\n{use_case}\n\n"
    if blueprint_text:
        user += f"REFERENCE BLUEPRINT ({blueprint_id}) — ground on this:\n{blueprint_text[:12000]}\n"
    else:
        user += "No close reference blueprint — design from first principles.\n"

    raw = nim.chat(
        messages=[
            {"role": "system", "content": PLAN_SYSTEM_PROMPT % catalog.catalog_prompt_block()},
            {"role": "user", "content": user},
        ],
        json_mode=True,
        temperature=0.0,
    )
    parsed = _extract_json(raw)
    if not parsed.get("services"):
        # Surface what the model actually returned so we can diagnose rather
        # than silently ship an empty architecture.
        print(
            f"[plan] WARNING: no services parsed. Raw model output (first 800 chars):\n"
            f"{raw[:800]}",
            file=sys.stderr,
        )

    # 3. Validate service ids against the catalog; enrich with name + layer.
    services, dropped = [], []
    valid_ids = set()
    for s in parsed.get("services", []):
        sid = s.get("id", "")
        if catalog.is_valid(sid):
            services.append(
                {"id": sid, "name": catalog.name_of(sid), "role": s.get("role", ""), "layer": catalog.layer_of(sid)}
            )
            valid_ids.add(sid)
        else:
            dropped.append(sid)

    # 4. Keep only connections whose endpoints survived validation.
    connections = [
        {"from": c["from"], "to": c["to"], "data": c.get("data", "")}
        for c in parsed.get("connections", [])
        if c.get("from") in valid_ids and c.get("to") in valid_ids
    ]

    # 5. Sort services by layer order for clean left→right visualization.
    services.sort(key=lambda s: catalog.LAYER_ORDER.index(s["layer"]) if s["layer"] in catalog.LAYER_ORDER else 99)

    return {
        "use_case": use_case,
        "blueprint_id": blueprint_id,
        "services": services,
        "connections": connections,
        "dropped": dropped,
    }


def _cli() -> int:
    if len(sys.argv) < 2:
        print('usage: python -m sdk_orchestrator.plan "<use case>"', file=sys.stderr)
        return 2
    result = plan_architecture(" ".join(sys.argv[1:]))
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
