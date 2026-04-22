# Blueprint notebooks

This directory holds full `.ipynb` files copied verbatim from NVIDIA's
official AI Blueprints. Stage 3 notebook generation matches incoming
GoalSpecs against the records in `lib/blueprints.ts` and, when a match is
found, uses the blueprint notebook here as the base — parameterizing
specific cells with the user's GoalSpec details — rather than generating
from scratch.

This is the class-level fix for the Stage 3 hallucinations observed in
Exp 17 (hospital chatbot) and Exp 18 (fraud detection): cells labeled as
"NeMo Guardrails" etc but implementing their functionality with Python
regex / sklearn / HuggingFace equivalents. When the source cells come
from NVIDIA's own blueprint, they use the real SDK APIs by construction.

## Files expected in this directory

| File | Source | Covers |
|---|---|---|
| `enterprise-rag.ipynb` | https://github.com/NVIDIA-AI-Blueprints/rag (release-v2.5.0 `notebooks/launchable.ipynb`) | generic chatbot, healthcare chatbot, any RAG-shaped use case |
| `fraud-detection.ipynb` | https://github.com/NVIDIA-AI-Blueprints/fraud-detection | real-time transaction fraud, tabular/GNN ML |

Metadata per blueprint (matching rules, parameterizable slots, service
path it represents) lives in `lib/blueprints.ts` keyed by the filename
stem.

## Why these two blueprints specifically

- **Enterprise RAG** covers the `chatbot` class — both generic "chatbot
  for hospitals" style prompts and detailed healthcare RAG prompts with
  EHR integration. The blueprint already includes NeMo Retriever, NeMo
  Guardrails with real `RailsConfig.from_path()` + Colang rails, and
  the full document-ingest → retrieve → generate loop. Covers the
  semantic gaps from Exp 17.
- **Fraud Detection** covers the tabular / non-LLM class. RAPIDS feature
  engineering, GNN training via DGL/cuGraph, TensorRT optimization with
  current (≥8.0) Builder/Config API, Triton serving. Covers the
  deprecated-API, `import rapids`, `python -m xgboost.onnx` hallucination
  classes from Exp 18.

Any GoalSpec whose domain doesn't match either blueprint falls through
to the existing from-scratch notebook generation path — no regression
for novel domains (see `lib/blueprint-matcher.ts` no-match threshold).

## How to add a new blueprint

1. Clone the NVIDIA blueprint repo (e.g. `git clone https://github.com/NVIDIA-AI-Blueprints/<name>`).
2. Copy its launchable or primary example `.ipynb` into this directory
   with a short stable filename stem (e.g. `retail-agentic-commerce.ipynb`).
3. Add a record to `lib/blueprints.ts` keyed by the same stem, describing
   the domain keywords, the service path it covers, and the
   parameterizable slots (cells / literal strings that get substituted
   from the incoming GoalSpec).
4. Re-run the existing test prompts to verify it's not incorrectly
   stealing matches from other blueprints. Adjust keyword match
   thresholds if so.
5. Record stale-data-risk: NVIDIA updates blueprints over time. Record
   the source commit SHA in `lib/blueprints.ts` so we can detect when
   the upstream file has drifted.

## Placeholder state

If a blueprint `.ipynb` file is missing from this directory, the matcher
in `lib/blueprint-matcher.ts` logs a warning and returns no-match for
that blueprint, letting the pipeline fall through to from-scratch
generation. The orchestration code will NOT fail loud — it degrades
gracefully to the pre-blueprint behavior.

**Current state of this directory (as of this commit):**
placeholder / skeleton `.ipynb` files committed for both blueprints so
the type-check and matcher wiring can be exercised. **Before live
testing, replace each skeleton with the real blueprint `.ipynb`
downloaded from the URLs above.**
