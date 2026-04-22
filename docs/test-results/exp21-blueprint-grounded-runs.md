# Experiment 21: Blueprint-Grounded Stage 3 — Three Prompts

**Date:** 2026-04-22
**Branch:** `claude/blueprint-grounding`
**Backing provider:** Brev self-hosted NIM (2× H100 NVL, FP8 TP=2, NIM v2.0.3)
**Architecture:** Blueprint-as-grounding (Stage 3 LLM has the matched blueprint's cell content injected into its system prompt as "REFERENCE BLUEPRINT — use as grounding, NOT as final output")

## Context

Exp 19 shipped a first-pass blueprint implementation that returned the
matched blueprint *verbatim* with only a goal-context cell prepended.
Fast (2 s, no LLM call) but the user got NVIDIA's generic demo with a
sticker, not a customized plan.

Exp 20 replaced that with "blueprint-as-grounding": the blueprint's
cell content inlined into the Stage 3 system prompt as reference for
the LLM to customize against. First attempt produced a 4-cell stub
(LLM was drifting into prose outside the JSON array format).

Exp 21 is Exp 20 + two prompt-hardening fixes:

1. `lib/blueprint-grounding.ts` filters the reference notebook to code
   cells + markdown cells ≥120 chars substantive (cuts Enterprise RAG
   reference from ~58k chars to ~25k).
2. System prompt now has the JSON-only directive at BOTH top and
   bottom with explicit "if you find yourself writing outside the
   array, STOP" guidance, plus an explicit 30–60 cell target.

Three prompts tested. Two blueprints in `data/blueprints/`:
- `enterprise-rag.ipynb` — 69 cells, real NVIDIA RAG launchable
- `fraud-detection.ipynb` — 84 cells, real NVIDIA Fraud Detection blueprint

## Run 21a — Vague healthcare

**Prompt:** `chatbot for hospitals` (3 words)
**Blueprint matched:** `enterprise-rag` (keyword + service-overlap score ≫ threshold)
**Stage 3 latency:** 7 min 15 s, single pass
**Cells:** 31
**Grade:** **8.0 / 10**

### Stage 1 / Stage 2 carried in

- Stage 1 loop ran: 4 perf goals including a CSAT target, 4 compliance
  (HIPAA, GDPR, FDA SaMD, HITECH), 5 inferred requirements.
- Stage 2 produced 13 services (NeMo Retriever missing despite RAG-shape —
  the vague-input Retriever gap, unchanged from earlier experiments).

### What worked

1. **Real `nemoguardrails` imports.** Cell 13:
   `from nemoguardrails import LLMRails, RailsConfig` — the actual API
   Exp 17 labeled but substituted with Python regex.
2. **Real clinical Colang flows.** Generated `config.yml` + `rails.co`
   with 5 flows: `check_consent`, `detect_phi` (with PHI entities:
   patient name, MRN, SSN, DOB, address, phone), `check_scope`
   (medical keywords only), `red_flag_check` (chest pain, stroke,
   severe bleeding — matching the GoalSpec's red-flag definition),
   `phi_redaction`.
3. **Multilingual synthetic clinical data** in English / Spanish / French —
   hospital FAQ ("What are the visiting hours?", "¿Dónde está la
   farmacia?"), symptom triage with red-flag labels, consent language.
   Not a Wikipedia sample.
4. **WCAG 2.1 AA HTML scaffold** with semantic CSS variables addressing
   the GoalSpec's accessibility requirement.
5. **Red-flag evaluator test set** bilingual with actual emergency
   escalation text ("⚠️ call 911").

### Residual issues

- **Cell 13 Guardrails main model**: `google/mt5-small` — a 300M
  multilingual translation model. Placeholder-quality for clinical use.
- **Cell 11 fine-tuning**: explicitly "simulate fine-tuning by running
  1 batch" — pragmatic for a demo notebook; not production training.
- **Cell 23 AI Enterprise**: simulates BAA / audit logging via env
  vars rather than a real deployment.

## Run 21b — Detailed healthcare (HIPAA + Epic EHR)

**Prompt:**

> Build a HIPAA-compliant conversational AI assistant for a 500-bed
> urban hospital network. Nurses and patients will use it on tablets
> and phones. It should pull patient context from Epic EHR, answer
> medication and discharge questions in English and Spanish, refuse
> anything outside clinical scope, and escalate to a human if
> confidence is low. Target p95 response under 3 seconds, 99.9%
> uptime, deployable on-prem on 2× H100s with an option to offload
> non-PHI queries to NIM-hosted inference. Must log every interaction
> for audit and pass a clinical-safety evaluation before go-live.

**Blueprint matched:** `enterprise-rag`
**Stage 3 latency:** 7 min 15 s, single pass
**Cells:** 40
**Grade:** **8.5 / 10 — session best**

### Stage 2 (12 services)

`NeMo Curator → NeMo → NeMo Retriever → NeMo Guardrails → TensorRT-LLM
→ Model Optimizer → Dynamo-Triton → NeMo Agent Toolkit → AI Enterprise
→ NeMo Evaluator → AI Workbench → NIM` (NIM at step 12 specifically as
the off-premise non-PHI fallback the user's prompt requested).

### What worked — genuinely production-quality

1. **Cell 30 Epic FHIR stub (6265 chars).** Real `EpicFHIRClient` class
   with OAuth2 token flow (`_get_access_token`, expiry tracking),
   proper `Accept: application/fhir+json` header, FHIR Bundle /
   MedicationRequest resource structure, **actual RxNorm terminology**
   (`"code": "860975", "display": "Metformin 500 mg Oral Tablet"` —
   real RxNorm CUI). Not in the blueprint — generated from the
   GoalSpec's "Epic EHR via FHIR" signal.
2. **Cell 20 Agent Toolkit — real Triton HTTP protocol.** Correct
   inference request shape: `input_ids`, `input_lengths`,
   `request_output_len`, `bad_words_list`, `stop_words_list` — these
   are real TRT-LLM Triton backend parameters.
3. **Cell 28 NIM — non-PHI fallback as described.** OpenAI-compatible
   `OpenAI(base_url="https://integrate.api.nvidia.com/v1")` client
   with `query_nim(prompt, model)` helper. Directly addresses the
   prompt's "option to offload non-PHI queries to NIM-hosted
   inference."
4. **Dedicated Epic FHIR Integration Stub section (cells 29–30)** and
   **Performance & Safety Settings customization section (cells 31–32)**
   — these are sections the blueprint doesn't have, added because the
   GoalSpec called them out.

### Residual issues

- **Cell 28 typo**: `im_models = [...]` (missing `n`). Benign for the
  cell as written but would `NameError` if referenced as `nim_models`.
- **Cell 28 hallucinated NIM model**: `nvidia/nemotron-4-340b-instruct`
  not in NVIDIA's actual catalog.
- **Cell 12 Colang syntax quirks**: `if ... in ...: then` isn't
  idiomatic Colang. Structurally correct (config.yml + rails.co
  layout) but may not parse cleanly.

## Run 21c — Detailed fraud detection

**Prompt:**

> Build a real-time credit-card fraud detection system for a retail
> bank processing 50,000 transactions per second at peak. Decisions
> must return within 8ms p95… 95% recall… 0.1% FPR… 7-year audit
> retention per SOX… hot-swap models weekly… on-prem + AWS hybrid
> with failover… integrate with existing Kafka stream and
> chargeback dispute workflow.

**Blueprint matched:** `fraud-detection` (NVIDIA's real 84-cell
blueprint, not the placeholder I originally committed — was replaced
alongside `enterprise-rag.ipynb` outside of my commits)
**Stage 3 latency:** 2 min 11 s, single pass — **fastest grounded run**
**Cells:** 22
**Grade:** **7.5 / 10**

### Stage 1 / Stage 2

- Stage 1 loop **held the user's ambitious numbers**: 50k TPS
  (burstable to 100k), 8 ms p95, 95 % recall, 0.1 % FPR, 99.99 %
  uptime — all preserved verbatim. No Exp-15-style target softening.
- Stage 2: 6 services (RAPIDS → DGX Cloud → Model Optimizer →
  TensorRT → Dynamo-Triton → AI Enterprise). Tightest fraud path of
  the session, zero padding, correct data-flow order.

### What worked — best of the session in two specific cells

1. **Cell 13 Triton config.pbtxt.** Real pbtxt grammar:
   ```
   name: "fraud_detection"
   platform: "tensorrt_plan"
   max_batch_size: 32
   input [{ name: "input", data_type: TYPE_FP32, dims: [...] }]
   instance_group [{ kind: KIND_GPU }]
   dynamic_batching {}
   ```
   Plus correct tritonserver CLI flags (`--model-repository`,
   `--http-port`, `--grpc-port`, `--strict-model-config=false`) and
   `/v2/health/ready` health polling. This is a clear win vs Exp 17/18
   where pbtxt was hand-rolled from a Python dict and malformed.

2. **Cell 15 audit logging — real compliance pattern.** HMAC-SHA256
   integrity per entry + `compliance.sox_retention_years: 7` +
   `pci_dss_tokenized: True` + `gdpr_right_to_erasure: "tokenized_pan_only"`.
   Append-only JSONL with `hmac.compare_digest` verification loop.
   Directly addresses the prompt's "retain explanations for 7 years
   per SOX" requirement.

### Prompt-specific customization

- **Cell 5 SHA256-based format-preserving PAN tokenization** —
  preserves first 6 + last 4 digits (PCI convention). Pragmatic
  placeholder with honest comment: "not cryptographically secure -
  for demo only."
- **Cell 17 Kafka Integration Stub** — directly from the prompt.
  `simulate_kafka_consumer` + `simulate_kafka_producer` with realistic
  SASL_SSL env-var structure, consumer-group naming, exactly-once
  semantics called out.
- **Cell 19 evaluation against exact targets** — uses the user's
  stated targets (8 ms, 50k TPS, 95 %, 0.1 %) as assertion thresholds
  with tick/cross markers.
- **Cell 11 TensorRT — correct modern CLI.** Uses
  `trtexec --onnx --saveEngine --int8 --calib` (correct) instead of
  Exp 18's deprecated `builder.max_batch_size` / `builder.build_cuda_engine(network)`
  API. Direct benefit of blueprint grounding.

### Residual issues — same hallucinations as Exp 18 + one new parse error

- **Cell 3 pip package list:**
  ```
  rapids==24.06      # not a real pypi package
   tensorrt          # leading space
  modelopt           # should be `nvidia-modelopt`
  ```
  Same `rapids` hallucination class from Exp 17/18 — blueprint
  grounding didn't catch it.
- **Cell 9 hard syntax errors** (cell WILL raise `SyntaxError` on
  first execution):
  ```python
  from pytorch_modelopt import torch.quantization as mtq    # invalid — can't dot-path in from-import
  quantizer = mtq.quantizer quantizer = mtq.quantizer         # garbled duplicate
  ```
  `pytorch_modelopt` is also not the right package name — should be
  `modelopt.torch.quantization`.
- **Missing imports:** Cell 7 uses `confusion_matrix` without
  `from sklearn.metrics import confusion_matrix`; Cell 19 uses
  `recall_score` without importing it.
- **Cell 5 "format-preserving" tokenization isn't true FPE** (FF1/FF3
  would be required for PCI DSS). Honest comment in the cell says
  "not cryptographically secure - for demo only."

## Quality trajectory across the session

| Run | Path | Latency | Cells | Grade |
|---|---|---|---|---|
| Exp 17 (from-scratch, vague healthcare) | 8 | 5:28 | 20 | 7.0 |
| Exp 18 (from-scratch, detailed fraud) | 6 | 2:49 | 15 (incomplete) | 6.5 |
| Exp 19 (blueprint verbatim) | — | 0:02 | 70 | 6.5 for target use case |
| Exp 20 (blueprint-as-grounding, broken) | — | 5:31 | 4 (stub) | failed |
| Exp 21a (grounded, vague healthcare) | 11 | 7:15 | 31 | 8.0 |
| **Exp 21b (grounded, detailed healthcare)** | 12 | 7:15 | 40 | **8.5** |
| Exp 21c (grounded, detailed fraud) | 6 | 2:11 | 22 | 7.5 |

## Class-level findings

### Validated

1. **Blueprint grounding adds genuine customization** (not a sticker).
   Exp 21b's FHIR stub with RxNorm codes + OAuth2 flow came from the
   GoalSpec's "Epic EHR via FHIR" signal, not the blueprint (the
   Enterprise RAG blueprint has no FHIR). Exp 21c's Kafka stub +
   7-year SOX retention came from the fraud GoalSpec, not the
   blueprint.

2. **Blueprint grounding fixes API-correctness failure classes from
   Exp 17/18:**
   - Real `nemoguardrails` imports (Exp 21a) replaced Exp 17's
     Python-regex Guardrails fake.
   - Correct Triton pbtxt grammar (Exp 21c) replaced Exp 17/18's
     malformed dict-to-f-string pbtxt.
   - Current `trtexec` CLI (Exp 21c) replaced Exp 18's deprecated
     `builder.*` TensorRT API.

3. **Output ceiling scales with blueprint quality.** Healthcare
   (69-cell Enterprise RAG launchable) produced 8.0–8.5. Fraud
   (84-cell fraud-detection blueprint, slightly more code-heavy) also
   produced a clean Triton cell and real audit logging but ran into
   a non-parseable Model Optimizer cell. Blueprint grounding doesn't
   eliminate residual hallucinations on specific APIs.

### Still open

1. **`rapids==24.06` pip hallucination persists** on all three fraud
   runs (Exp 18 + two blueprint-grounded variants). Class fix: add
   `rapids` to a known-bad-packages list in the AST validator — a few
   hours of work, closes this hallucination deterministically across
   all future runs.

2. **Stage 2 drops NeMo Retriever on vague RAG prompts** (Exp 21a
   omitted Retriever despite healthcare context). Blueprint grounding
   at Stage 3 can't fix a Stage 2 omission. Class fix: blueprint-
   retrieval signal at Stage 2, or typed service catalog with
   expected-producer/consumer pairs.

3. **Cell-level syntax errors** (Exp 21c cell 9) are the exact class
   that a self-heal loop on Brev (Exp 14 pattern) would close
   deterministically on first execution. With self-heal wired behind
   `/api/generate-notebook`, Exp 21c would ship as ~8.5/10 after one
   repair pass.

4. **Unresolved slot tokens in blueprint.** Parameterizer's
   `{{TOKEN}}` substitution still lives in `lib/blueprint-parameterizer.ts`
   but isn't called on this branch. Real NVIDIA blueprints don't have
   `{{TOKEN}}` markers — they have hardcoded values. The parameterizer
   is dead code; remove or repurpose on next cleanup pass.

## Artifacts

- Downloaded notebooks:
  - `nvidia-pipeline-ai-1776889949539.ipynb` — Exp 21a
  - `nvidia-pipeline-ai-1776891062956.ipynb` — Exp 21b
  - `nvidia-pipeline-ai-1776892414034.ipynb` — Exp 21c
- Session summary: `docs/test-results/session-2026-04-21-summary.md`
- Per-experiment review: this file.
