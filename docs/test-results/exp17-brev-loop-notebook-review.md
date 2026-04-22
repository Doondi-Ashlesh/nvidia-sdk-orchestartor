# Experiment 17: End-to-End Pipeline on Brev Self-Hosted NIM (Loop-Default)

**Date:** 2026-04-21
**Branch:** `claude/stage1-loop-default`
**Backing provider:** Brev self-hosted NIM (2× H100 NVL, FP8 TP=2, NIM v2.0.3, vLLM v0.19.0)
**Correlation ID:** `d9839e68-c603-4fd0-8971-4cc68317b188`
**Artifact:** `C:\Users\THUNDER\Downloads\nvidia-pipeline-ai-1776815833207.ipynb` (93 KB, 20 cells)

## Purpose

Validate the full pipeline (GoalSpec → Path → Notebook) end-to-end against
self-hosted NIM instead of the shared API, to (a) confirm Exp 10's "shared
API silently caps response quality" thesis on today's current codebase,
and (b) produce a concrete notebook to score against Exp 9's 8/10 shared-
API baseline.

## Setup

### Infrastructure

- **Brev instance:** `sdk-orchestrator`, 2× NVIDIA H100 NVL (95 GB/GPU),
  driver 580.105.08, CUDA 13.
- **NIM container:** `nvcr.io/nim/nvidia/nemotron-3-super-120b-a12b:latest`
  (v2.0.3). Profile: `vllm-fp8-tp2-pp1-65.0` (hash
  `57d42cc7d33914933427e7f8d8cb1773bc11e5c96826c92095820a8776e6a4f6`).
- **Tunnel:** `brev port-forward sdk-orchestrator -p 8000:8000` from WSL.
- **`.env.local`:** `NIM_BASE_URL=http://localhost:8000/v1`,
  `NIM_CHAT_MODEL=nvidia/nemotron-3-super-120b-a12b`.

### Code state

- Stage 1: adversary loop ON (branch default), `MAX_ADVERSARY_ROUNDS=2`,
  early-exit thresholds in effect.
- Stage 2: data-flow prompt (Exp 8), `MAX_STEPS=15` safety cap, no
  retry-on-validator-signal.
- Stage 3: grounding-patterns prompt, validator retries REMOVED (AST /
  Python syntax / narrative validators run as observability only,
  never re-prompt).

### Input

- **Prompt:** `chatbot for hospitals` (3 words — the vague class from
  Exp 15).
- **Pipeline latency (end-to-end):** ~3–4 minutes total across Stage 1 +
  Stage 2 as reported by user.
- **Stage 3 latency (notebook generation alone):** 327,713 ms = **5 min 28 s**,
  recorded in provenance cell 0.
- **Stage 3 attempts:** 1 (single-pass — validator-retry removal held).

### Stage 2 path that fed Stage 3

8 services (rendered order via layer-sort, not data-flow order):
TensorRT → NeMo Curator → RAPIDS → NeMo → NeMo Guardrails → NeMo
Evaluator → Dynamo-Triton → AI Enterprise.

## Results

### Notebook composition

20 cells (10 markdown, 10 code). Structure: provenance → overview →
prerequisites → environment-check → (markdown + code) × 8 per service.

| Cell | Type | Length | Purpose |
|---|---|---|---|
| 0 | markdown | 595 | Provenance header |
| 1 | markdown | 1349 | Goal + 14 carried-forward perf targets |
| 2 | markdown | 732 | Prerequisites |
| 3 | code | 1836 | Setup + env checks |
| 4–5 | md+code | 3849 | TensorRT conversion |
| 6–7 | md+code | 3370 | NeMo Curator (data prep) |
| 8–9 | md+code | 4673 | RAPIDS (bias analysis) |
| 10–11 | md+code | 5844 | NeMo (fine-tuning) |
| 12–13 | md+code | 8243 | NeMo Guardrails (safety wrap) |
| 14–15 | md+code | 12140 | NeMo Evaluator (metrics + fairness) |
| 16–17 | md+code | 5880 | Dynamo-Triton (serving) |
| 18–19 | md+code | 15966 | AI Enterprise (operations) |

### What worked

1. **Provenance verified end-to-end.** Cell 0 header stamps
   `provider=nim-self-hosted:nvidia/nemotron-3-super-120b-a12b@http://localhost:8000/v1`.
   The `localhost:8000` confirms Brev served the call.
2. **No validator-retry regression.** Single pass, 5.5 min total, 20
   cells out. Compared against the Windows dry-run from 2026-04-21
   morning (5-cell stub after 27 min with the retry loop), the fix
   held cleanly.
3. **Real NGC model IDs used.** `nvidia/stt_en_conformer_ctc_small`
   (Conformer CTC for ASR) and `nvidia/tts_en_fastpitch` (FastPitch
   TTS) are both real NGC-published models. `from_pretrained()` calls
   would succeed.
4. **Correct API surface where it counts:**
   - `cudf.read_json`, `cudf.read_parquet` — correct cuDF.
   - `sklearn.metrics.brier_score_loss`, `precision_recall_fscore_support` — correct.
   - `mlflow.log_metric` — correct MLflow API.
   - Triton `config.pbtxt` schema — `platform: tensorrt_plan`,
     `max_batch_size`, `dynamic_batching.max_queue_delay_microseconds`,
     `instance_group.kind: KIND_GPU` all correct.
5. **Real fairness computation.** Cell 15 computes equal opportunity
   difference and demographic parity in code across demo subgroups —
   not just named in markdown, actually implemented.
6. **Real PHI masking regexes** (SSN, email, phone, IP patterns) in
   cells 13 and 15.
7. **Honest simulation disclaimers.** Every service cell's markdown
   ends with "Production would use X, this demo simulates Y." No
   false claims.
8. **Stage 1 perf goals propagate.** All 14 quantified targets from
   the GoalSpec appear verbatim in the notebook overview.

### What went wrong

#### Hallucinated pip package names (cell 3)

- `rapids` — **not a real pypi package.** RAPIDS installs as
  `cudf-cu12`, `cuml-cu12`, etc. via NVIDIA's custom pip index or
  conda. `pip install rapids` fails.
- `nemo-collections-asr`, `nemo-collections-nlp`, `nemo-collections-tts`
  — **not real pypi names.** Correct: `nemo-toolkit[asr]` / `[nlp]` /
  `[tts]` (also present in same cell — duplicated intent).
- `pycuda` — probably unnecessary next to `tensorrt`.

#### NeMo services labeled in markdown but NOT using NeMo APIs in code

- **Cell 7 (NeMo Curator)** uses HuggingFace `datasets.load_dataset()`
  and `AutoTokenizer`. Does NOT use NeMo Curator's `Pipeline` /
  `ProcessingStage` (which Exp 9 TC-1 got right). Label is cosmetic.
- **Cell 11 (NeMo framework)** uses HuggingFace `Trainer` /
  `TrainingArguments`. Does NOT use NeMo's trainer.
- **Cell 13 (NeMo Guardrails)** implements guardrails as Python dict
  and regex logic. Does NOT use `RailsConfig.from_path()` + `LLMRails`
  (the real API Exp 9 got right). Self-labeled "simulated."
- **Cell 15 (NeMo Evaluator)** uses sklearn metrics directly. Does
  NOT use `nemo-evaluator-launcher run --config` CLI that Exp 9
  produced.

#### Factual / execution errors

- **Cell 5 wrong class load:**
  `MegatronGPTModel.from_pretrained("nvidia/megatron-bert-uncased-345m")`
  — `MegatronGPTModel` expects GPT-style causal LM checkpoints;
  `megatron-bert-uncased-345m` is an encoder-only BERT. Class
  mismatch; raises at load time. Fallback branch to
  `bert-base-uncased` works.
- **Cell 11 syntax error:**
  `# Initialize model and tokenizermodel_name = "bert-base-uncased"`
  — comment and assignment on one line with no newline. Python
  treats everything after `#` as comment; `model_name` never
  defined; next line `tokenizer = AutoTokenizer.from_pretrained(model_name)`
  raises `NameError`.
- **Cell 19 `shutil.copy` on a directory:**
  `shutil.copy("models/bert_intent_finetuned", ...)` —
  `save_pretrained` creates a directory, not a file; `shutil.copy`
  raises `IsADirectoryError`. Should be `shutil.copytree`.
- **Cell 17 pbtxt hand-generation:** Triton's `config.pbtxt` is
  Protocol Buffer text format. Hand-rolling from a Python dict with
  `f.write(f"{key}: {value}\n")` won't produce valid pbtxt (string
  values need different quoting, nested lists have specific syntax).
  Server would reject the config. Schema fields are correct; the
  serialization is not.

#### Missing integration code

- **No actual TensorRT conversion.** Cell 5 downloads checkpoints
  but doesn't build the TRT engines it claims to produce. No
  `trtexec` CLI, no `torch.onnx.export` + `trtexec --saveEngine`.
- **No Triton server launch.** Cell 17 writes the model repository
  but doesn't start `tritonserver` or `docker run`.
- **No MLflow tracking URI.** Cell 15 calls `mlflow.log_metric`
  without `mlflow.set_tracking_uri(...)`. Metrics land in default
  `./mlruns/` — fine for local dev, not wired to any real server.

## Grade

**7/10 as a production-correct notebook.** Below Exp 9's averaged 8/10
primarily because of the two clear pip-package hallucinations, the
cell 11 syntax error, and because where Exp 9 TC-1 used real NeMo
Guardrails and NeMo Evaluator APIs, this run substituted HuggingFace
/ sklearn equivalents.

## Self-heal prediction

If executed on Brev with Exp 14's fix-notebook-cell orchestrator loop,
~5 of the 7 wrong-things-listed would close in 1–2 iterations because
they surface as deterministic execution errors (NameError, pip fail,
IsADirectoryError, class mismatch, pbtxt parse error). The 2 that
wouldn't close automatically are semantic:

1. "Labeled as NeMo service but uses HuggingFace equivalent" — runs
   successfully, just isn't using the correct NVIDIA SDK. Needs a
   stronger grounding signal than execution errors.
2. Missing actual TensorRT/Triton-launch integration code — no error
   because the cells succeed with their simulated behavior.

## Implications for the roadmap

1. **Blueprint-grounded Stage 3** would replace 7 of the 10 code cells
   with parameterized NVIDIA blueprint code. The 7 semantic issues
   above evaporate because we're not generating those cells — we're
   parameterizing known-good ones.
2. **Self-heal on Brev (Exp 14 pattern)** would deterministically
   close the 5 mechanical errors in one iteration. Wiring this behind
   `/api/generate-notebook` is the most tractable next infrastructure
   piece.
3. **Grounding-manifest extension**: add `rapids`,
   `nemo-collections-asr`, `nemo-collections-nlp`, `nemo-collections-tts`
   to the AST validator's known-bad-packages list. Deterministic fix.

## Key comparison data

| Run | Provider | Input | Stage 3 latency | Attempts | Cells | Grade |
|---|---|---|---|---|---|---|
| Dry-run 2026-04-21 (retry loop ON) | Shared API | detailed | 27 min | 3 | 5 (stub) | failed |
| Exp 9 TC-1 (Exp 8 prompt) | Shared API | "help doctors..." | 4.4 min | 1 | 17 | 8.0 |
| Exp 9 TC-2 | Shared API | "build fraud detection" | 4.9 min | 1 | 17 | 8.0 |
| Exp 9 TC-3 | Shared API | "build rec engine" | 5.0 min | 1 | 21 | 8.0 |
| **This (Exp 17)** | **Brev** | **"chatbot for hospitals" (3 words)** | **5.5 min** | **1** | **20** | **7.0** |

Note: Exp 17 input was vague (3 words) vs Exp 9's goal-level prompts
(6–10 words). Despite vaguer input, output depth is comparable to
Exp 9 — consistent with the Exp 10 "shared API silently caps
response quality" finding lifted by Brev.

## Artifacts

- Downloaded notebook: `C:\Users\THUNDER\Downloads\nvidia-pipeline-ai-1776815833207.ipynb`
- Provenance: `docs/test-results/exp17-brev-loop-notebook-review.md` (this file)
- Correlation ID (server logs): `d9839e68-c603-4fd0-8971-4cc68317b188`
