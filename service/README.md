# SDK Orchestrator — Service (NeMo Agent Toolkit)

The V2 orchestration brain (decision D10). Python, built on NeMo Agent Toolkit
(`nvidia-nat`). The Next.js app becomes UI/visualizer only and calls this
service; this is where the agent, grounding, and verification live.

## Status — Phase 1, Increment 1A

What's here now (runnable with just a NIM key):

- **`sdk_orchestrator/nim.py`** — hosted-NIM embedding/chat clients (free tier, D5)
- **`sdk_orchestrator/ingest.py`** — blueprint corpus → Milvus Lite (grounding backbone, D8)
- **`sdk_orchestrator/manifest.py`** — the agent↔visualizer contract (mirrors `types/manifest.ts`, D3)
- **`config.yaml`** — NAT workflow config (llms / embedders / retrievers verified; functions/workflow scaffolded for 1B)

Coming in **Increment 1B** (after `pip install nvidia-nat` lets us pin exact imports):

- `register.py` — `@register_function` glue for `select_blueprint` + `search_corpus`
- the `functions:` + `workflow:` blocks in `config.yaml`

## Setup

```bash
cd service
pip install -e .                       # installs nvidia-nat, pymilvus, openai, pydantic, nbformat
export NVIDIA_NIM_API_KEY=nvapi-...     # free key from build.nvidia.com
```

## Ingest the blueprint corpus into Milvus Lite

```bash
python -m sdk_orchestrator.ingest
```

Reads `../data/blueprints/*.ipynb`, embeds them via `nv-embedqa-e5-v5`, writes a
local `./milvus.db` with a populated `blueprints` collection. This is the
grounding store the agent will query.

**Verify it worked:**
```bash
python -c "from pymilvus import MilvusClient; c=MilvusClient('./milvus.db'); \
print('collections:', c.list_collections()); \
print('count:', c.query('blueprints', filter='', output_fields=['id'], limit=10))"
```
You should see the `blueprints` collection with one row per blueprint
(`enterprise-rag`, `fraud-detection`).

## Run the agent (Increment 1B onward)

```bash
nat run   --config_file config.yaml --input "HIPAA-compliant clinical chatbot"
nat serve --config_file config.yaml          # HTTP service the visualizer calls
```

## Notes

- `milvus.db` is git-ignored — it's a generated artifact, rebuilt by `ingest`.
- The NAT function imports in `register.py` (1B) must be pinned against the
  installed `nvidia-nat` version. Verify with:
  `python -c "import nat; from nat.cli.register_workflow import register_function; print('ok')"`
  and adjust import paths in `register.py` to match before wiring `config.yaml`.
- Python CI for this service is a follow-up; the existing GitHub Actions CI
  covers the Next.js app only.
