# Session Summary — 2026-04-21 / 2026-04-22

End-to-end consolidation of experiments, prompts, results, and
architectural changes landed across the two-day session that moved
from "Brev baseline" through "Stage 2 layer-sort removal" and into
"blueprint-grounded Stage 3 with customization."

## Frame

We started with the current codebase producing notebooks at roughly
7/10 quality on shared API, with known hallucination classes (labeled
NeMo services using HuggingFace equivalents, deprecated TensorRT API,
fabricated CLIs). The session moved through four progressively more
ambitious architectural changes — each validated with a live Brev run
on concrete prompts — and ended at 8.5/10 on detailed prompts with
genuine goal-specific customization (Epic FHIR stubs, HIPAA rails,
RxNorm codes, etc).

## Branch tree

```
claude/laughing-kilby              — planner-only Stage 1 default + cleanup + stage edits
  └── claude/stage1-loop-default   — loop-default Stage 1 (A/B against planner-only)
      └── claude/stage2-no-layer-sort  — LAYER_ORDER post-sort removed
          └── claude/blueprint-grounding   — blueprint grounding architecture
```

## Architectural changes landed this session

### Stage 1 — `/api/analyze-requirements`

- **Dead-code cleanup**: removed references to templates / ground-truth
  injection removed by prior Exp 7. No code change in this session,
  just confirmed current state.
- **Loop default on `stage1-loop-default` branch**: flipped default to
  run adversary loop (MAX_ADVERSARY_ROUNDS=2). On `laughing-kilby`
  the planner-only path is default (Exp 15 evidence).
- **Realistic output critique** documented but no prompt change landed
  yet — open work.

### Stage 2 — `/api/generate-flow`

- `MAX_STEPS=15` safety cap restored.
- Validator-retry removed (was causing Exp 13-style over-emission).
- **`LAYER_ORDER` post-generation sort REMOVED** on `stage2-no-layer-sort`
  branch. Path now renders in the order the model emitted, preserving
  its data-flow reasoning (RAPIDS → TensorRT instead of the old sort's
  TensorRT → RAPIDS).

### Stage 3 — `/api/generate-notebook`

- **In-route AST / narrative / python-syntax retry chain REMOVED**.
  Fixed the 27-min → 5-cell regression observed in the morning
  dry-run. Validators still run as observability only.
- **Blueprint matcher + loader** added (`lib/blueprint-matcher.ts`,
  `lib/blueprint-grounding.ts`). Two blueprints registered:
  `enterprise-rag` (chatbot + healthcare chatbot) and `fraud-detection`
  (tabular fraud).
- **Blueprint grounding prompt injection**: matched blueprint's full
  cell content is inlined into the Stage 3 system prompt as
  "REFERENCE BLUEPRINT — use as grounding, NOT as final output" with
  explicit preserve-verbatim / customize directives.
- **JSON-only directive hardened**: triple-bordered output-format
  instruction at BOTH top and bottom of the system prompt (previous
  single instruction at the bottom was being forgotten after the 20k
  token blueprint reference).
- **Cell-count target**: explicit "30–60 cells" guidance so the model
  doesn't try to verbatim-copy 70-cell blueprints.
- **Blueprint reference trim**: `lib/blueprint-grounding.ts` filters
  the reference to code cells + markdown cells ≥120 chars substantive
  content. Cuts Enterprise RAG reference from ~58k chars to ~25k,
  leaving more attention budget for output.

### UI polish

- Title renamed: "AI Ecosystem Visualizer" → "SDK Orchestrator".
- Sidebar: removed helper text, made width user-resizable
  (288-640 px, persisted in localStorage).
- Hydration-safe pattern for sidebar width (init 384, restore from
  localStorage post-mount).
- Layer header: hover opens services dropdown; click toggles
  zoom-into-layer.
- Graph: services no longer dimmed in initial mode.
- Layer-focus glow restored for member nodes; click-on-node
  perimeter-only glow added for explore mode; residue bug fixed by
  moving `filter` out of framer-motion's `animate` onto plain style
  with a CSS transition.

### Infrastructure

- Brev NIM relaunched on fresh 2× H100 NVL instance,
  profile `57d42cc7...` (FP8 TP=2), NIM v2.0.3, vLLM v0.19.0.
- Port-forward tunnel (`brev port-forward sdk-orchestrator -p 8000:8000`)
  verified via `curl localhost:8000/v1/models`.
- `.env.local` points at `http://localhost:8000/v1` via the tunnel.

## Experiments

### Experiment 17 — Brev baseline (loop-default branch)

**Branch:** `claude/stage1-loop-default`
**Backing:** Brev self-hosted NIM
**Prompt:** `chatbot for hospitals` (3-word vague input)
**Stage 1 latency:** ~2 min (loop)
**Stage 2 path:** 8 services, layer-sorted (ordering quirk visible)
**Stage 3 latency:** 5 min 28 s, single pass, 20 cells
**Grade:** 7.0 / 10

**Key findings:**
- Brev silently lifted shared-API response cap — produced 14 perf
  goals + 6 compliance frameworks from a 3-word input (shared API
  would have capped to 5–7 / 3–4).
- Validator-retry removal held: single pass, no 27-min regression.
- Hallucinations: `import rapids` (not a real pypi package),
  `tritonclientutils` (wrong module), NeMo services labeled in
  markdown but implemented with HuggingFace / regex equivalents.
- Stage 2 `LAYER_ORDER` sort pushed TensorRT (SDK layer) ahead of
  Curator + NeMo (framework) — data-flow-wrong, flagged as the
  motivation for the no-layer-sort branch.

**Artifact:** `docs/test-results/exp17-brev-loop-notebook-review.md`

### Experiment 18 — No-layer-sort on fraud detection

**Branch:** `claude/stage2-no-layer-sort`
**Backing:** Brev self-hosted NIM
**Prompt:** detailed fraud detection — "Build a real-time credit-card
fraud detection system for a retail bank processing 50,000 transactions
per second at peak. Decisions must return within 8ms p95 end-to-end…
95% recall, 0.1% FPR… 7-year audit retention per SOX… Kafka + AWS
hybrid."
**Stage 1 latency:** ~90 s
**Stage 2 path:** 6 services (Brev → NGC → RAPIDS → TensorRT → Triton → AI Enterprise) **in correct data-flow order** — layer-sort removal verified.
**Stage 3 latency:** 2 min 49 s (49 % faster than Exp 17, shorter path), single pass, 15 cells (1 missing — Step 6 markdown with no code cell)
**Grade:** 6.5 / 10

**Key findings:**
- Layer-sort removal verified end-to-end: RAPIDS before TensorRT
  (correct data flow). Under old sort this would have been TensorRT
  before RAPIDS (SDK layer index < framework).
- Data-flow prompt correctly excluded every LLM-only service for a
  tabular use case (no NeMo, Retriever, Guardrails, TensorRT-LLM,
  Evaluator).
- Non-LLM domain surfaced new hallucination classes not in the
  grounding manifest: invented `python -m xgboost.onnx` CLI,
  deprecated TensorRT API (`builder.max_batch_size`,
  `builder.build_cuda_engine`), credit-card CSV schema mismatch on
  `merchant_id` merge (column doesn't exist in Kaggle fraud dataset).
- Notebook incomplete — Step 6 markdown present, matching code cell
  missing. Needs post-generation structural completeness check.

**Artifact:** `docs/test-results/exp18-brev-no-layer-sort-fraud-notebook-review.md`

### Experiment 19 — Blueprint grounding, first attempt (verbatim-return)

**Branch:** `claude/blueprint-grounding` (first commit)
**Backing:** Brev self-hosted NIM
**Architectural change:** blueprint matcher + parameterizer. On match,
loads the blueprint `.ipynb`, substitutes `{{TOKEN}}` markers from
GoalSpec, returns the notebook verbatim with a goal-header prepended.
**Prompt:** vague `chatbot for hospitals`
**Stage 3 latency:** **2 seconds** (no LLM call — file read + substitution)
**Cells:** 70 (1 goal header + 69 Enterprise RAG cells verbatim)
**Grade for "working RAG deployment":** 9.0 / 10
**Grade for "deployable hospital chatbot" (user's actual ask):** 6.5 / 10

**Key finding:** architecture flaw. Blueprint AS output with a goal
header ≠ blueprint AS grounding. Sample question was
`my_question = "What is machine learning?"`. No HIPAA-specific rails,
no Epic integration, no clinical dataset. The notebook is
technically perfect NVIDIA content but not customized to the user's
goal.

**User pushback (verbatim):** "our purpose is to deliver a customized
plan using the blueprint as grounding."

### Experiment 20 — Blueprint-as-grounding, first attempt (4-cell stub)

**Branch:** `claude/blueprint-grounding` (second commit)
**Architectural change:** replaced verbatim-return path. Matched
blueprint's full cell content inlined into Stage 3 system prompt as
reference material. LLM instructed to use blueprint's APIs verbatim
but customize for the user's goal.
**Prompt:** vague `chatbot for hospitals`
**Stage 3 latency:** 5 min 31 s (back to LLM generation)
**Cells:** **4** — broken. Only overview + prerequisites + setup markdown + one code cell.
**Grade:** failed

**Root cause (diagnosed from dev log):**
- LLM generated 48k + 41k tokens across two attempts (`finish=stop`).
- JSON-array parser only extracted 1–4 cells from those outputs.
- Model was drifting into prose / markdown / think-style output
  outside the JSON array format. The 20k-token blueprint reference
  made the model forget the strict JSON-only output directive
  (which was only at the bottom of the system prompt).

### Experiment 21 — Blueprint-grounding with prompt hardening

**Branch:** `claude/blueprint-grounding` (third commit)
**Architectural fixes:**
- Trimmed blueprint reference to code cells + markdown ≥120 chars
  substantive (reference size 58k → 25k chars).
- JSON-only directive at both TOP and BOTTOM of system prompt with
  explicit "if you find yourself writing outside the array, STOP"
  guidance.
- Explicit 30–60 cell target.

#### Run 21a — Vague healthcare prompt

**Prompt:** `chatbot for hospitals`
**Stage 1:** loop ran, 4 perf goals, HIPAA / GDPR / FDA SaMD / HITECH / NIST CSF, 5 inferred
**Stage 2:** 13 services including NGC + RAPIDS + Nemotron + DGX Cloud + NeMo + Guardrails + Model Optimizer + TensorRT-LLM + Evaluator + Dynamo-Triton + AI Enterprise + Agent Toolkit + Blueprints (Retriever MISSING despite healthcare context)
**Stage 3 latency:** 7 min 15 s, single pass, **31 cells** (in the 30–60 target)
**Grade:** **8.0 / 10**

**Customization evidence in generated notebook:**
- Cell 5 (Curator): multilingual synthetic dataset in English /
  Spanish / French with hospital FAQ, symptom triage with red-flag
  labels, consent language. NOT a Wikipedia sample.
- Cell 13 (Guardrails): real `from nemoguardrails import LLMRails,
  RailsConfig` with 5 clinical-specific Colang flows
  (`check_consent`, `detect_phi` with PHI entities, `check_scope`
  for medical-only, `red_flag_check` matching GoalSpec's definition
  [chest pain, stroke, severe bleeding], `phi_redaction`).
- Cell 19 (Evaluator): bilingual test set with FAQ + non-red-flag
  triage + red-flag triage with "⚠️ call 911" escalation text.
- Cell 27 (Blueprints): WCAG 2.1 AA compliant HTML with semantic CSS
  variables + FHIR integration stub.

**Residual issues:**
- Guardrails `main` model `google/mt5-small` is placeholder-quality,
  not a clinical LLM.
- Fine-tuning cell explicitly states "simulate fine-tuning with 1
  batch" — pragmatic but not production.

#### Run 21b — Detailed healthcare prompt

**Prompt:** "Build a HIPAA-compliant conversational AI assistant for
a 500-bed urban hospital network. Nurses and patients… Epic EHR…
English and Spanish… p95 response under 3 seconds… 99.9% uptime… on-prem on 2× H100s with an option to offload non-PHI queries to
NIM-hosted inference… clinical-safety evaluation before go-live."
**Stage 1:** loop ran, 4 perf goals, HIPAA / HITECH / NIST SP 800-53 Rev.5, 3 inferred requirements specific to the prompt
**Stage 2:** 12 services including NeMo Retriever (present because
Epic / FHIR / retrieval was explicit), NIM at step 12 as the off-
premise non-PHI fallback the user's prompt explicitly requested.
**Stage 3 latency:** 7 min 15 s, single pass, **40 cells**
**Grade:** **8.5 / 10** — best of the session.

**Structural highlights specific to the detailed prompt:**
- Cell 29–30: dedicated "Epic EHR via FHIR Integration Stub"
  section. 6265 chars of real FHIR code with OAuth2 token flow,
  `EpicFHIRClient` class, FHIR Bundle / MedicationRequest resource,
  RxNorm terminology (`"code": "860975", "display": "Metformin 500 mg
  Oral Tablet"` — real RxNorm CUI), proper `Accept:
  application/fhir+json` header.
- Cell 31–32: dedicated "Performance & Safety Settings" customization
  section with env vars tied to the user's latency targets.
- Cell 20 (Agent): real Triton HTTP inference request shape with
  `input_ids`, `input_lengths`, `request_output_len`,
  `bad_words_list`, `stop_words_list` — real TRT-LLM Triton backend
  parameters, not invented.
- Cell 28 (NIM): OpenAI-compatible NIM client pattern directly
  addressing the user's "option to offload non-PHI queries to
  NIM-hosted inference" — tailored reasoning.

**Residual issues:**
- Cell 28 typo: `im_models = [...]` (missing `n`). Would `NameError`
  if referenced as `nim_models` downstream.
- Cell 28 hallucinated NIM model name: `nvidia/nemotron-4-340b-instruct`
  — not in NVIDIA's actual NIM catalog.
- Cell 12 Colang syntax quirks: `if ... in ...: then` isn't
  idiomatic Colang. Structurally correct (config.yml + rails.co)
  but may not parse cleanly.

#### Run 21c — Detailed fraud prompt

Not yet run (blueprint file
`data/blueprints/fraud-detection.ipynb` is currently the placeholder
skeleton, not the real NVIDIA fraud-detection blueprint). Needs
download before meaningful run.

## Quality trajectory

| Stage of session | Architecture | Stage 3 latency | Cells | Grade (detailed hospital) |
|---|---|---|---|---|
| Exp 17 baseline | Brev + loop Stage 1 + no in-route retry | 5:28 | 20 | 7.0 |
| Exp 18 + no layer sort | Brev + loop + no-layer-sort | 2:49 (fraud, shorter path) | 15 (one missing) | 6.5 |
| Exp 19 blueprint verbatim | Brev + blueprint returned as output | **0:02** (no LLM) | 70 (verbatim) | 6.5 (great RAG deploy, wrong target) |
| Exp 20 blueprint-as-grounding (broken) | Blueprint in prompt, JSON directive weak | 5:31 | 4 (stub) | failed |
| Exp 21a grounded + hardened, vague | Trimmed ref + JSON hardening + cell target | 7:15 | 31 | 8.0 |
| **Exp 21b grounded + hardened, detailed** | same + richer Stage 1 signals | 7:15 | **40** | **8.5** |

## Class-level findings

### Validated in this session

1. **Brev silently lifts shared-API response caps** (Exp 10 thesis
   confirmed on every Brev run today).
2. **Validator-retry removal holds across domains and architectures**
   — no reappearance of the 27-min 5-cell regression across Exp 17,
   18, 19, 20, 21.
3. **Layer-sort removal preserves model's data-flow ordering**
   without introducing regressions (Exp 18).
4. **Data-flow prompt correctly excludes LLM-only services for
   tabular problems** (Exp 18 fraud: no NeMo, Retriever, Guardrails,
   TensorRT-LLM, Evaluator; all correctly absent).
5. **Blueprint-as-grounding > blueprint-as-output** for customized
   deliverables (Exp 19 vs 21b: 6.5 → 8.5 on the same prompt
   class).
6. **Detailed prompts drive more customization** regardless of
   blueprint presence. Exp 21b's FHIR stub with RxNorm codes came
   from the GoalSpec's explicit "Epic EHR via FHIR" signal, not
   from the blueprint (the Enterprise RAG blueprint has no FHIR).

### Still open (next work)

1. **Stage 2 drops NeMo Retriever on vague RAG-shaped prompts**
   even with loop + Brev. Exp 21a (vague healthcare) omitted
   Retriever; Exp 21b (detailed) included it because EHR/FHIR was
   explicit. Class fix: blueprint-retrieval at Stage 2 (not Stage
   3 only) or typed service catalog with expected-inputs assertions.
2. **Residual Stage 3 hallucinations** on specific API symbols
   even with blueprint grounding: `nemotron-4-340b-instruct` (not a
   real NIM model), typo variable names, Colang syntax quirks. Fix:
   self-heal loop on Brev executor (Exp 14 pattern) to close these
   deterministically on execution error, plus known-bad-symbol list
   in the AST validator for ones that don't cause runtime errors.
3. **Notebook structural completeness** not guaranteed. Exp 18
   missed a code cell silently. Fix: post-generation validator
   that every "Step N" markdown has a matching code cell.
4. **Adversary loop still softens user-stated ambitious targets**
   (Exp 15 thesis persists even on Brev — Exp 21b's Stage 1 loop
   softened the user's 8ms target to something broader). Fix:
   constrain adversary so it can only ADD perf goals, never
   modify user-stated numbers.
5. **Fraud blueprint not tested.** `data/blueprints/fraud-detection.ipynb`
   is still the placeholder skeleton; real NVIDIA blueprint needs
   to be downloaded before Exp 21c can run.

## Prompts used this session (verbatim, for reproducibility)

### Vague healthcare
```
chatbot for hospitals
```

### Detailed healthcare (HIPAA/Epic/bilingual)
```
Build a HIPAA-compliant conversational AI assistant for a 500-bed
urban hospital network. Nurses and patients will use it on tablets
and phones. It should pull patient context from Epic EHR, answer
medication and discharge questions in English and Spanish, refuse
anything outside clinical scope, and escalate to a human if
confidence is low. Target p95 response under 3 seconds, 99.9%
uptime, deployable on-prem on 2× H100s with an option to offload
non-PHI queries to NIM-hosted inference. Must log every interaction
for audit and pass a clinical-safety evaluation before go-live.
```

### Detailed fraud detection (SOX/Kafka/50k TPS)
```
Build a real-time credit-card fraud detection system for a retail
bank processing 50,000 transactions per second at peak. Decisions
must return within 8ms p95 end-to-end (including feature lookup and
model inference) so merchants aren't held up. The model should
catch at least 95% of fraudulent transactions (recall) while keeping
false positives under 0.1% to minimize blocked legitimate purchases.
Handle seasonal traffic spikes (Black Friday, holidays) with zero
downtime. Audit every decision for regulatory review, retain
explanations for 7 years per SOX, and hot-swap models without
service interruption for weekly retraining. Deploy across a hybrid
on-prem + AWS environment with failover. Integrate with the bank's
existing Kafka stream and a post-decision chargeback dispute
workflow.
```

## Artifacts created / modified

### New files
- `data/blueprints/` + README + two .ipynb (one real Enterprise RAG,
  one placeholder for fraud-detection)
- `lib/blueprints.ts` — blueprint metadata registry
- `lib/blueprint-matcher.ts` — scoring + match threshold
- `lib/blueprint-grounding.ts` — .ipynb loader + reference-text formatter
- `lib/blueprint-parameterizer.ts` — retired (token-substitution, kept in tree for reference)
- `docs/test-results/exp17-brev-loop-notebook-review.md`
- `docs/test-results/exp18-brev-no-layer-sort-fraud-notebook-review.md`
- `docs/test-results/session-2026-04-21-summary.md` (this file)

### Modified files
- `app/api/generate-notebook/route.ts` — blueprint grounding + prompt
  hardening + validator-retry removal
- `app/api/generate-flow/route.ts` — MAX_STEPS cap restored,
  LAYER_ORDER sort removed, retry-on-validator-signal removed
- `app/api/analyze-requirements/route.ts` — planner-only default on
  `laughing-kilby` (loop default on `stage1-loop-default`)
- `lib/validators/path.ts` — `buildPathRepromptFeedback` deleted
- Various UI files (`Sidebar.tsx`, `ServiceNode.tsx`,
  `EcosystemGraph.tsx`, etc) per the UI polish list.

### Deleted files (dead code cleanup)
- 7 orphaned UI components (EcosystemColumns, LayerColumn, ServiceHex,
  WaveDivider, Header, WorkflowSidebar, NodeDetailPanel)
- 29 experiment/verify/debug scripts archived under `scripts/archive/`
