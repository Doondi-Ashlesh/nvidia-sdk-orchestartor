# Phase 2 — Heal on real H100 (Brev)

> Same input notebook as Phase 1 (`exp14-input.ipynb`), but the agent ran on a real NVIDIA H100 PCIe (85 GB) on a Brev instance instead of locally. This forced the agent to actually install NVIDIA SDKs (NeMo, ModelOpt, TensorRT-LLM, etc.) and grounded the fixes in real behavior — not laptop guesses about what would happen on a GPU.

## Headline result

| | Phase 1 (laptop) | Phase 2 (H100) |
|---|---|---|
| Code cells | 11 | 10 *(cell 8 was reclassified markdown)* |
| Passing **initially** | 2 | **0** *(setup-cell cascade — typical real-infra reality)* |
| Passing **after heal** | 10 | **10** |
| Cells with real (not stubbed) NVIDIA APIs | 0 | **2** *(see "the two phase-2-only wins" below)* |
| External-system dependencies flagged | 0 | 1 *(MPI for TensorRT-LLM)* |
| Unresolved | 0 | 0 |
| Turns used | 12 / 30 | 22 / 50 |
| Skills consulted by agent | none | `nvidia/Model-Optimizer/ptq` |

## The two Phase-2-only wins

Phase 1 stubbed cells 11 and 15 with `# REQUIRES GPU` markers because the libraries don't install on a laptop. Phase 2 actually installed them and produced **real, canonical code**:

### Cell 11 — NeMo Guardrails
- **Phase 1:** stubbed; preserved a hand-written YAML that mixed Python code into YAML (invalid)
- **Phase 2:** wrote two valid files (`config.yml` YAML + `flows.co` Colang) and used `RailsConfig.from_path(tmpdir)`. RailsConfig loads cleanly. LLMRails init fails as expected (no inference endpoint), caught by the existing except block.

### Cell 15 — ModelOpt INT8 quantization
- **Phase 1:** stubbed; left `mtq.QuantizerConfig` in (hallucinated API)
- **Phase 2:** **agent consulted `~/.claude/skills/nvidia/Model-Optimizer/ptq/SKILL.md`** (this is the new SKILL.md rule paying off) and replaced with `mtq.INT8_DEFAULT_CFG` + `forward_loop=callable` — the actual public API.

## Honest infra dependencies surfaced

Things you can't know from the laptop run but the H100 run revealed:

| Dependency | Reality on Brev box |
|---|---|
| `faiss-gpu` | Not on PyPI for Python 3.12. Agent fell back to `faiss` (CPU+GPU bundle). |
| `tensorrt_llm` | Installs but requires `libmpi.so` (MPI). Not present on default Brev image. Cell 17 marked `REQUIRES EXTERNAL SYSTEM: MPI`. |
| `nemo-toolkit`, `nemo-collections`, `nemo-evaluator-launcher` | Require Python 3.10. Box runs 3.12. Cells fall back to HuggingFace equivalents. |
| `nemoguardrails` LLMRails | RailsConfig loads fine; LLMRails init needs a live LLM backend. Expected; handled by existing try/except. |

These are exactly the production-readiness signals you don't get from static analysis or the laptop loop.

## Directory layout

```
phase2/
├── README.md                       you are here
├── original.ipynb                  the input (same as docs/test-results/exp14-input.ipynb)
├── healed.ipynb                    the agent's final notebook
├── heal-report.json                structured outcome (initial vs final, fixes applied, skills consulted, infra notes)
├── iterations/
│   ├── run0.ipynb                  initial papermill run on the H100 — shows real failure tracebacks
│   ├── run1.ipynb                  after the first round of fixes
│   ├── run2.ipynb                  after the second round
│   └── final-executed.ipynb        last full run with cell outputs preserved
├── agent-scripts/                  Python helpers the agent wrote inline during the session
│   ├── inspect_cells.py            lists cell types + first lines (used for triage)
│   ├── verify_cells.py             checks each cell parses cleanly with ast.parse
│   ├── check_modelopt.py           introspected modelopt to confirm the canonical API
│   ├── check_guardrails.py         tested RailsConfig.from_path before patching cell 11
│   ├── check_cell15.py             cell-15 ModelOpt-specific verification
│   ├── fix_notebook.py             first round of patches
│   ├── fix2_notebook.py            second round
│   ├── fix3_notebook.py            third round
│   └── apply_fixes.py              final apply pass
├── generated-configs/
│   ├── evaluation_config.yaml      written by the notebook's eval cell
│   └── triton-enterprise-values.yaml  Helm values from the AI Enterprise cell
└── agent-session/
    └── phase2-main.jsonl           full Claude Code session — every tool call, every result
```

## What's NOT included (by intent)

The Brev box also produced these, but they're large reproducible artifacts and not committed:

- `fine_tuned_model/` (318 MB) — actual distilgpt2 fine-tune output
- `quantized_model/` (318 MB) — real INT8 quantized weights from ModelOpt
- `results/` (938 MB) — Trainer checkpoints + logs
- `medical_vector_index.faiss` (2.4 MB) — built FAISS index
- `triton_repo/` (2.4 MB) — generated Triton model repo
- `engine/` — TensorRT-LLM engine placeholder

If you need any of these, they're at `C:\Users\THUNDER\Desktop\phase2-bundle\` until you clean it up.

## How to read this

1. Start with **`heal-report.json`** — one-page structured outcome
2. Diff **`original.ipynb`** vs **`healed.ipynb`** to see every change
3. For deeper context, walk **`iterations/run0.ipynb`** → `run1.ipynb` → `run2.ipynb` to see the agent's progression
4. To audit how the agent reasoned, open **`agent-session/phase2-main.jsonl`** (large, JSON-Lines)
5. The **`agent-scripts/`** are evidence the agent did real introspection rather than guessing — `check_modelopt.py` for example is what produced the `mtq.INT8_DEFAULT_CFG` discovery

## Cost

- Brev: ~$5–10 (2× H100 PCIe for ~30 min)
- Anthropic: hit the Pro plan rate limit mid-run; switched to API key. Rough estimate ~$10–15 in API credits for the full session.
- **Total: ~$15–25 per Phase 2 run**

This is meaningfully more than my earlier $2–10 estimate. The cost driver is the volume of context the agent works with once large NVIDIA skills are loaded and the package installs trigger many tool calls.
