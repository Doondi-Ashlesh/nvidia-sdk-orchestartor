# Experiment 18: Brev Self-Hosted NIM + No Layer-Sort — Fraud Detection

**Date:** 2026-04-21
**Branch:** `claude/stage2-no-layer-sort`
**Backing provider:** Brev self-hosted NIM (2× H100 NVL, FP8 TP=2, NIM v2.0.3, vLLM v0.19.0)
**Correlation ID:** `33d750df-2a99-42a8-87d9-46495c67dab4`
**Artifact:** `C:\Users\THUNDER\Downloads\nvidia-pipeline-ai-1776827292826.ipynb` (~93 KB, 15 cells)

## Purpose

Validate two things in one run:
1. **Layer-sort removal at Stage 2.** Previous Exp 17 observed the layer
   sort pushing TensorRT (SDK layer) ahead of training/data-prep services
   in the path. This branch drops the sort; the model's emitted order is
   shipped verbatim.
2. **Non-LLM-domain behaviour.** Fraud detection has no text / no RAG —
   path should exclude NeMo, NeMo Retriever, Guardrails, TensorRT-LLM,
   Evaluator (all LLM-only). Contrasts with Exp 17's LLM chatbot.

## Setup

### Infrastructure

- **Brev instance:** fresh `sdk-orchestrator` (user deletes + recreates
  per session), 2× NVIDIA H100 NVL 95 GB each, NIM v2.0.3, FP8 TP=2.
- **Tunnel:** `brev port-forward sdk-orchestrator -p 8000:8000`.
- **`.env.local`:** unchanged from Exp 17 — `NIM_BASE_URL=http://localhost:8000/v1`.

### Code state

- Stage 1: adversary loop ON (branch inherits from
  `claude/stage1-loop-default`), `MAX_ADVERSARY_ROUNDS=2`.
- Stage 2: data-flow prompt, `MAX_STEPS=15` cap, **LAYER_ORDER post-sort
  REMOVED**. Model's emitted order passes through post-processing
  unchanged.
- Stage 3: grounding-patterns prompt, validator retries removed.

### Input

- **Prompt** (detailed, ~150 words):
  ```
  Build a real-time credit-card fraud detection system for a retail
  bank processing 50,000 transactions per second at peak. Decisions
  must return within 8ms p95 end-to-end … 95% recall, 0.1% FPR, zero
  downtime … SOX 7-year retention, Kafka + AWS hybrid …
  ```
- **Total pipeline latency (Stage 1 + Stage 2 + Stage 3):** ~5–6 min
  end-to-end.
- **Stage 3 latency alone:** **169,625 ms = 2 min 49 s**
  (49 % faster than Exp 17's 5 min 28 s on an 8-service path).
- **Stage 3 attempts:** 1 (single-pass).

### Stage 1 output (summarized)

- Domain: Financial Services / Banking Fraud Detection
- Compliance: PCI DSS v4.0, GDPR / CCPA, AML, Basel III / BCBS 239
- Perf: ≤10 ms p95, ≥95 % recall, ≤0.5 % FPR, ≥20 k TPS
- 4 inferred requirements (real-time feature store, SHAP explainability,
  drift + auto-retrain, secure API gateway)
- **Loop softened targets vs the prompt:** 8 ms → 10 ms, 0.1 % → 0.5 %,
  50 k → 20 k TPS. Same Exp 15 pattern — adversary loop softens the
  ambitious targets from the user's prompt.

### Stage 2 path (after layer-sort removal)

6 services, **in the model's emitted data-flow order**:
1. NVIDIA Brev
2. NGC Catalog
3. NVIDIA RAPIDS
4. NVIDIA TensorRT
5. NVIDIA Dynamo-Triton
6. NVIDIA AI Enterprise

**Critical check — ordering:** under the old `LAYER_ORDER` sort, with
`sdk=1 < framework=2`, this path would have been reordered to
`Brev → NGC → TensorRT → RAPIDS → Triton → AI Enterprise` — TensorRT
(SDK) dragged ahead of RAPIDS (framework), which is data-flow-wrong
(you optimize AFTER feature engineering + training). With the sort
removed, the correct order **RAPIDS → TensorRT** survives. First run
today to verify layer-sort removal at the Stage 2 layer.

## Results — what worked

1. **Provenance verified end-to-end.** Cell 0 stamps
   `provider=nim-self-hosted:nvidia/nemotron-3-super-120b-a12b@http://localhost:8000/v1`.
2. **No validator-retry regression.** Single pass, 15 cells, 2 min 49 s.
3. **Order matches the path order.** RAPIDS cell precedes TensorRT cell
   precedes Triton cell — the no-layer-sort fix propagates through
   Stage 3 cell sequence too.
4. **Real NGC-published data source.** Cell 9 pulls the Kaggle credit-card
   fraud CSV — real, public, executable dataset.
5. **Correct cuDF API surface.** `read_csv`, `to_datetime`,
   `to_timedelta`, `read_parquet`, `merge`, `fillna`, `to_parquet` —
   all valid cuDF signatures.
6. **Real TensorRT Python surface.** `trt.Builder`, `trt.Logger`,
   `trt.OnnxParser`, `trt.NetworkDefinitionCreationFlag.EXPLICIT_BATCH`
   — genuine TensorRT module.
7. **Triton `config.pbtxt` schema correct.** Field names and structure
   match real Triton schema (even if serialization has issues — see
   below).
8. **Honest simulation disclaimers.** No false claims about actually
   launching Triton or pulling containers.
9. **Correct non-LLM path.** No NeMo, no Retriever, no Guardrails, no
   TensorRT-LLM, no Evaluator. Data-flow prompt correctly excluded
   every LLM-only service for a tabular problem.

## Results — what went wrong

### Hallucinated imports / packages

- **Cell 7:** `import rapids` — no Python package called `rapids`. Same
  hallucination as Exp 17 cell 3. Real installation is per-library
  (`cudf-cu12`, `cuml-cu12`, …).
- **Cell 13:** `from tritonclientutils import np_to_triton_dtype` —
  wrong module. Correct: `from tritonclient.utils import np_to_triton_dtype`.
- **Cell 11:** `!python -m xgboost.onnx --input model.xgb --output model.onnx`
  — **xgboost has no `onnx` submodule or CLI.** Correct flow is
  `onnxmltools.convert.convert_xgboost(...)` or `skl2onnx`. The CLI
  is invented.

### Deprecated TensorRT API (cell 11)

All of the following are deprecated in TRT ≥ 8.0 (Brev runs TRT 10.x):
- `builder.max_batch_size`
- `builder.max_workspace_size`
- `builder.fp16_mode`
- `builder.platform_has_fast_fp16`
- `builder.build_cuda_engine(network)`

Modern API requires `config = builder.create_builder_config()` +
`config.set_flag(trt.BuilderFlag.FP16)` +
`builder.build_serialized_network(network, config)`. Running cell 11 on
Brev's image will raise `AttributeError` on the first deprecated call.

### Mechanical runtime bugs

- **Cell 11 missing parens:** `context = engine.create_execution_context`
  — stores the unbound method instead of invoking it. Any subsequent
  use of `context` fails. Deterministic bug.
- **Cell 9 schema mismatch:** loads `creditcard.csv` (Kaggle fraud
  dataset: columns V1–V28, Amount, Class, Time) then does
  `transactions.merge(merchant_risk, on='merchant_id')` — **the
  `merchant_id` column doesn't exist in that dataset.** Raises
  `KeyError` on first execution.
- **Cell 9 cuDF rolling:** `transactions.rolling('1h', on='timestamp')[...]`
  — cuDF's `rolling` doesn't support pandas-style time-based windows
  with `on=` the same way. May silently no-op or error depending on
  cuDF version.
- **Cell 13 hand-rolled `config.pbtxt`:** same bug as Exp 17 cell 17 —
  naive f-string serialization from a Python dict won't produce valid
  pbtxt (string values need quoting, nested lists have specific syntax).
  Triton would reject the config.

### Structural — notebook is incomplete

- Last cell is cell 14: markdown for Step 6 (AI Enterprise monitoring)
  with "Approach: We'll simulate serving logs, compute PSI…"
- **No code cell follows.** Expected cell 15 (AI Enterprise code) is
  missing. Either the JSON array closed early or the model truncated
  at a token boundary. Single-pass generation with `attempts=1` means
  no retry happened to catch this.

## Grade: 6.5 / 10

Below Exp 17 (7.0 / 10) primarily because:
- Notebook doesn't finish (missing Step 6 code).
- Deprecated TensorRT API (will hard-fail on current Brev image).
- Cell 11 `create_execution_context` without `()` is a deterministic bug.
- Cell 9 data-schema mismatch is a deterministic bug.

Above 6.0 because:
- Correct exclusion of LLM-only services for a tabular problem.
- Ordering preserved (RAPIDS before TensorRT — Exp 17 would have been
  sorted wrong without the no-layer-sort branch).
- Provenance, cuDF, TRT module surface, Triton schema all correct.

## Self-heal prediction

Of the 7 concrete issues listed:
- **4 deterministic execution errors** (pip `rapids` fail, `tritonclientutils`
  ImportError, deprecated TRT calls AttributeError, `create_execution_context`
  NoneType later, `merchant_id` KeyError) — Exp 14 orchestrator would close
  in 1–2 iterations because each surfaces a traceback.
- **1 hallucinated CLI** (`python -m xgboost.onnx`) — surfaces as
  `ModuleNotFoundError` — also catchable.
- **1 semantic issue** (malformed `config.pbtxt`) — only surfaces at Triton
  startup, which the notebook doesn't actually run. Self-heal wouldn't
  see it.
- **1 structural issue** (missing final code cell) — self-heal doesn't
  fix structural incompleteness; needs a pipeline-level detector.

## Class-level findings (vs Exp 17)

1. **Non-LLM path correctly excludes LLM services.** The data-flow
   prompt works for tabular problems, not just RAG/LLM shapes. Good
   durable result.
2. **Layer-sort removal propagates all the way to Stage 3 code cell
   order.** No separate fix needed in Stage 3; the path order it
   consumes is already correct.
3. **Shorter path ≠ higher quality.** 6 services vs Exp 17's 8 produced
   fewer cells but MORE mechanical errors per cell. Non-LLM domain
   introduces hallucination classes (XGBoost→ONNX CLI, credit-card
   schema assumptions) not in the grounding manifest.
4. **Structural completeness is not guaranteed by single-pass.** Exp 17
   hit 20 cells cleanly; Exp 18 hit 15 with a missing final code cell.
   Worth adding a post-generation completeness check (every markdown
   "Step N" should be followed by a code cell).

## Key comparison data

| Run | Path size | Stage 3 ms | Attempts | Cells | Grade |
|---|---|---|---|---|---|
| Dry-run (retry loop ON) | 9 | 27 min | 3 | 5 (stub) | failed |
| Exp 17 (Brev + loop, LLM chatbot) | 8 | 5:28 | 1 | 20 | 7.0 |
| **Exp 18 (Brev + loop + no-layer-sort, fraud)** | **6** | **2:49** | **1** | **15 (1 missing)** | **6.5** |

## Implications for the roadmap

1. **Blueprint grounding** would fix the deprecated TensorRT API
   (blueprint's TRT cell uses current `BuilderConfig` pattern),
   `import rapids` (blueprint's setup uses actual cuDF/cuML packages),
   `tritonclientutils` (blueprint imports from `tritonclient.utils`),
   and `xgboost.onnx` CLI (blueprint uses `onnxmltools` or has skip-TRT
   fallback). 4 of 7 issues close deterministically.
2. **Self-heal on Brev** closes the 2 remaining runtime bugs
   (`create_execution_context` parens, `merchant_id` KeyError) in one
   iteration.
3. **Structural completeness check** — new idea surfaced by this run.
   Every "Step N" markdown cell should have a matching code cell; add
   as a post-generation validator (observability only — don't retry
   on it).

## Artifacts

- Downloaded notebook: `C:\Users\THUNDER\Downloads\nvidia-pipeline-ai-1776827292826.ipynb`
- Provenance: `docs/test-results/exp18-brev-no-layer-sort-fraud-notebook-review.md`
  (this file)
- Correlation ID: `33d750df-2a99-42a8-87d9-46495c67dab4`
