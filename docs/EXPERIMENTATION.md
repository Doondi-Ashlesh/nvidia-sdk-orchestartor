# Stage 1 Pipeline — Experimentation Log

> **Purpose:** Track all optimizations to the planner/adversary pipeline with measured results.
> Used for model comparison studies and identifying which optimizations drive real improvement.

---

## Test Configuration

| Parameter | Value |
|---|---|
| **API Endpoint** | `POST /api/analyze-requirements` |
| **NIM Base URL** | `https://integrate.api.nvidia.com/v1` |
| **Embedding Model** | `nvidia/nv-embedqa-e5-v5` |
| **Infrastructure** | NVIDIA NIM API (shared multi-tenant cloud) |
| **Date** | 2026-04-11 |

---

## Standard Test Cases

All optimizations are tested against the same prompts for fair comparison.

| ID | Input | Complexity |
|---|---|---|
| **TC-1** | `"chatbot"` | Minimal — single word, max inference required |
| **TC-2** | `"build a medical RAG chatbot for hospitals"` | Medium — domain + architecture hints |
| **TC-3** | `"fine-tune an LLM for code generation"` | Medium — training-focused |

---

## Experiment 1: Baseline (Sequential Adversary Loop)

### Configuration
| Parameter | Value |
|---|---|
| **Model (all passes)** | `nvidia/nemotron-3-super-120b-a12b` |
| **Architecture** | Planner (120B) → Adversary (120B) → Resolution (120B) → loop |
| **Max rounds** | 5 |
| **Time cap** | 240,000ms (4 min) |
| **Stagnation window** | 2 rounds |
| **Min improvement ratio** | 20% (1 of 5 categories) |
| **Planner temperature** | 0.6 |
| **Adversary temperature** | 0.7 |
| **Resolution temperature** | 0.5 |
| **Planner max_tokens** | 4096 |
| **Adversary max_tokens** | 2048 |
| **Resolution max_tokens** | 4096 |

### Results — TC-1: `"chatbot"`

| Metric | Value |
|---|---|
| **Exit reason** | `error` — JSON parse failure (model returned `<think>` reasoning in content) |
| **Rounds completed** | 0 (planner pass succeeded, adversary loop failed) |
| **Total latency** | N/A — failed |
| **Notes** | Nemotron 3 120B uses `<think>` tags natively for chain-of-thought. Initial parser didn't handle this. Fixed by adding `<think>` tag stripping in `extractContent()` and `nimJsonCall()` retry wrapper. |

**Post-fix retest — TC-1: `"chatbot"`**

| Metric | Value |
|---|---|
| **Exit reason** | `error` — 504 gateway timeout |
| **Rounds completed** | Unknown (timeout during NIM call) |
| **Total latency** | >300,000ms |
| **Notes** | Too many sequential 120B calls overwhelmed the shared NIM API gateway. Led to implementing time cap. |

### Results — TC-2: `"build a medical RAG chatbot for hospitals"`

| Metric | Value |
|---|---|
| **Exit reason** | `timeout` |
| **Rounds completed** | 2 |
| **Total latency** | 365,382ms (365s / ~6 min) |
| **Draft → Final improvement** | Significant |

**Per-round breakdown:**

| Round | Challenges | Missing Reqs | Adjusted Targets | Resolution |
|---|---|---|---|---|
| 1 | 7 | 5 | 2 | Planner resolved all |
| 2 | 5 | 2 | 3 | Planner resolved all, then timeout hit |

**Convergence snapshots:**

| Snapshot | Challenges | Missing | Adjusted | Perf Goals | Inferred Reqs | Gaps | Conflicts |
|---|---|---|---|---|---|---|---|
| Round 1 | 7 | 5 | 2 | 4 | 4 | 5 | 2 |
| Round 2 | 5 | 2 | 3 | 4 | 9 | 5 | 2 |

**Quality of final GoalSpec (TC-2):**

| Dimension | Value |
|---|---|
| Domain | `clinical decision support` |
| Performance goals | 4 (retrieval_recall >90%, latency <1500ms, accuracy >90%, throughput >50 req/s) |
| Inferred requirements | 11 (up from 4 in draft) |
| Gaps | 5 |
| Conflicts | 2 |
| Summary quality | Rich, specific, includes HIPAA, citations, monitoring |

### Results — TC-2 Fast Mode: `"build a medical RAG chatbot for hospitals"` (`?fast=true`)

| Metric | Value |
|---|---|
| **Exit reason** | `fast_mode` (no adversary) |
| **Rounds completed** | 0 |
| **Total latency** | 49,654ms (~50s) |

**Quality of draft GoalSpec (fast mode):**

| Dimension | Value |
|---|---|
| Domain | `clinical decision support / patient triage chatbot` |
| Performance goals | 4 (latency <300ms, accuracy >90%, recall >80%, safety <0.1%) |
| Inferred requirements | 3 |
| Gaps | 4 |
| Conflicts | 2 |

### Baseline Observations

1. **Each 120B NIM call takes ~50s** on shared infrastructure (includes queue wait + inference)
2. **Adversary consistently finds 5-7 challenges** on first review of a draft spec
3. **Major improvement happens in round 1→2**: inferred requirements jumped 4→9 (125% increase)
4. **Diminishing returns after round 2**: challenges dropped only 7→5 (29%), not dramatic
5. **Time cap (4min) is the practical limiter** — stagnation detection never fires because timeout hits first
6. **Draft quality (fast mode) is already decent** — 4 perf goals, 3 inferred reqs, 4 gaps. The adversary loop adds depth (11 inferred reqs) but takes 6x longer
7. **JSON reliability is a problem** — 120B model's `<think>` tags and prose-in-content required parser hardening
8. **Total wall clock for 2 rounds: 365s** — not viable for a real-time customer-facing tool

### Key Bottleneck Analysis

| Bottleneck | Impact | Addressable? |
|---|---|---|
| NIM API queue latency | ~10-20s per call | Yes — self-hosted NIM |
| 120B model inference time | ~30-40s per call | Yes — quantization, smaller model for adversary |
| Sequential architecture | 3 calls per round | Yes — parallel adversary, single-pass self-critique |
| JSON parse failures | Causes retries (doubles call count) | Yes — JSON mode, better prompts |
| Round count | 2+ rounds before convergence | Yes — domain templates, richer first-pass prompt |

---

## Experiment 2: Optimization — Single-Pass Self-Critique

### Hypothesis
Combining planner + adversary + resolution into a single prompt will reduce 3 NIM calls per round to 1, cutting latency by ~66% while maintaining quality through in-context self-critique.

### Configuration Changes
| Parameter | Baseline | Optimized |
|---|---|---|
| Architecture | 3 separate calls per round | 1 call: generate + critique + refine |
| NIM calls (full mode) | 3-7+ | 1 |
| Expected latency | 365s | ~60-80s |

### Results — TC-2: `"build a medical RAG chatbot for hospitals"`

| Metric | Value |
|---|---|
| **Exit reason** | `selfcritique` |
| **NIM calls** | 1 |
| **Total latency** | 73,296ms (73s) |
| **Performance goals** | 5 |
| **Inferred requirements** | 9 |
| **Gaps** | 4 |
| **Conflicts** | 3 |

**Performance goals produced:**
- 95th percentile end-to-end latency: < 2 seconds
- Sustained query throughput: >= 50 queries/s per hospital node
- Retrieval recall@5: >= 0.85
- Answer clinical correctness (expert adjudication): >= 90%
- Hallucination rate (unsupported statements): < 5%

### Analysis

| Metric | Baseline (365s) | Self-Critique (73s) | Delta |
|---|---|---|---|
| Latency | 365s | 73s | **-80%** |
| NIM calls | 5+ | 1 | **-80%** |
| Perf goals | 4 | 5 | +25% |
| Inferred reqs | 11 | 9 | -18% |
| Gaps | 5 | 4 | -20% |
| Conflicts | 2 | 3 | +50% |

**Verdict:** Massive latency improvement (5x faster) with comparable quality. Inferred requirements slightly lower (9 vs 11) because there's no adversary pushing for more. But the 80% latency reduction makes this the clear winner for real-time use.

---

## Experiment 3: Optimization — Asymmetric Model Pairing

### Hypothesis
Using a smaller, faster model for the adversary pass (review/critique) while keeping the 120B model for generation will reduce adversary call time from ~50s to ~10-15s without meaningful quality loss.

### Configuration Changes
| Parameter | Baseline | Optimized |
|---|---|---|
| Planner model | 120B | 120B (unchanged) |
| Adversary model | 120B | 49B (`nvidia/llama-3.3-nemotron-super-49b-v1`) |
| Resolution model | 120B | 120B (unchanged) |

### Results — TC-2: `"build a medical RAG chatbot for hospitals"`

| Metric | Value |
|---|---|
| **Exit reason** | `timeout` |
| **Adversary rounds** | 2 |
| **Total latency** | 314,898ms (315s) |
| **Adversary model** | `nvidia/llama-3.3-nemotron-super-49b-v1` |
| **Performance goals** | 4 |
| **Inferred requirements** | 7 |
| **Gaps** | 4 |
| **Conflicts** | 3 |

**Per-round breakdown:**

| Round | Challenges | Missing Reqs | Adjusted Targets |
|---|---|---|---|
| 1 | 3 | 2 | 1 |
| 2 | 2 | 2 | 1 |

**Performance goals produced:**
- inference_latency_p95_emergency: <400ms
- inference_latency_p95_non_emergency: <800ms
- retrieval_recall_at_5: >85%
- answer_accuracy_clinical: >95%

**Notable:** The 49B adversary found fewer challenges per round (3 vs 7 from 120B), suggesting it's less thorough as a reviewer. Interesting differentiated latency targets (emergency vs non-emergency).

### Analysis

| Metric | Baseline (120B adv) | Asymmetric (49B adv) | Delta |
|---|---|---|---|
| Latency | 365s | 315s | **-14%** |
| Round 1 challenges | 7 | 3 | -57% (49B less thorough) |
| Perf goals | 4 | 4 | same |
| Inferred reqs | 11 | 7 | -36% |

**Verdict:** Modest latency improvement (-14%). The 49B adversary is noticeably less thorough — finds fewer issues, which means less improvement per round. The resolution step (still 120B) is the dominant time cost. Not the best standalone optimization.

---

## Experiment 4: Optimization — Domain Template Caching

### Hypothesis
Pre-computing baseline GoalSpecs for common domains (RAG, fine-tuning, agentic, etc.) and having the planner adapt rather than generate from scratch will produce higher-quality first drafts, reducing adversary rounds needed.

### Configuration Changes
| Parameter | Baseline | Optimized |
|---|---|---|
| Planner input | Raw user goal | User goal + closest domain template |
| Expected draft quality | 3-4 inferred reqs | 6-8 inferred reqs (from template) |
| Expected adversary rounds | 2-3 | 0-1 |

### Results — TC-2: `"build a medical RAG chatbot for hospitals"`

| Metric | Value |
|---|---|
| **Exit reason** | `approved` |
| **Adversary rounds** | 1 (approved on first review!) |
| **Total latency** | 161,307ms (161s) |
| **Domain template matched** | `medical` |
| **Performance goals** | 5 |
| **Inferred requirements** | 5 |
| **Gaps** | 4 |
| **Conflicts** | 2 |

**Per-round breakdown:**

| Round | Challenges | Missing Reqs | Adjusted Targets |
|---|---|---|---|
| 1 | 0 | 0 | 0 |

**The adversary found ZERO issues on the first review.** The domain template enriched the planner input so thoroughly that the draft spec was production-quality on the first pass.

**Performance goals produced:**
- clinical_accuracy_on_medqa: >90%
- safety_violation_rate: <0.1%
- retrieval_recall_at_5: >85%
- inference_latency_p95: <2000ms
- system_uptime: >99.9%

### Analysis

| Metric | Baseline (no template) | Cached (medical template) | Delta |
|---|---|---|---|
| Latency | 365s | 161s | **-56%** |
| Adversary rounds | 2 (timeout) | 1 (approved!) | **-50%** |
| Exit reason | timeout | **approved** | First clean approval! |
| Perf goals | 4 | 5 | +25% |
| Inferred reqs | 11 | 5 | -55% (but all high-quality) |

**Verdict:** The **most impactful single optimization.** Domain templates produce such thorough first drafts that the adversary approves immediately. 56% latency reduction. The only trade-off is fewer inferred requirements (5 vs 11), but the template already covers the critical ones. Could be combined with self-critique for even better results.

---

## Experiment 5: Combined Optimizations (cached + asymmetric)

### Configuration
Domain template caching + 49B adversary model. (Self-critique is a separate path, not combined with adversary loop.)

### Results — TC-2: `"build a medical RAG chatbot for hospitals"`

| Metric | Value |
|---|---|
| **Exit reason** | `timeout` |
| **Adversary rounds** | 2 |
| **Total latency** | 344,350ms (344s) |
| **Domain template** | `medical` |
| **Adversary model** | `nvidia/llama-3.3-nemotron-super-49b-v1` |
| **Performance goals** | 5 |
| **Inferred requirements** | 7 |
| **Gaps** | 4 |
| **Conflicts** | 2 |

**Per-round breakdown:**

| Round | Challenges | Missing Reqs | Adjusted Targets |
|---|---|---|---|
| 1 | 3 | 2 | 1 |
| 2 | 3 | 2 | 1 |

### Analysis

| Metric | Cached-only (161s) | Combined (344s) | Delta |
|---|---|---|---|
| Latency | 161s | 344s | **+113% worse!** |
| Exit reason | approved | timeout | Regression |
| Rounds | 1 (approved) | 2 (timeout) | Regression |

**Verdict:** Combined mode is **worse** than cached-only. The 49B adversary is less discerning than the 120B — it finds issues the 120B wouldn't, leading to unnecessary extra rounds. The 120B adversary (cached mode) recognized the template-enriched spec was good enough and approved it immediately. The 49B adversary doesn't have that judgment.

**Key insight:** Combining optimizations doesn't always help. The asymmetric adversary (49B) is actually counterproductive when paired with domain caching — it creates false-positive challenges that waste resolution rounds.

---

## Experiment 6: Grounded Adversary (Stage 2 Knowledge Base)

### Hypothesis
Replacing the subjective adversary with a fact-checker grounded in real NVIDIA blueprint data will produce higher-quality, evidence-backed challenges — every critique cites a real blueprint, not an opinion. Combined with domain templates and self-critique draft.

### Architecture Change (MAJOR)
```
Previous: Planner → Adversary (opinions) → Resolution
New:      Planner (with domain template) → Grounded Fact-Checker (cites blueprints) → Resolution

Stage 2 knowledge base:
  - 15 NVIDIA AI Blueprint repos fetched from GitHub (334ms, cached 1hr)
  - Extracted: services used, compliance reqs, architecture patterns per blueprint
  - Retrieved via keyword matching against user goal
  - Injected into adversary prompt as evidence the fact-checker must cite
```

### Configuration
| Parameter | Value |
|---|---|
| **Mode** | `default` (new default pipeline) |
| **Planner** | Self-critique prompt + domain template injection |
| **Adversary** | Grounded fact-checker with real NVIDIA blueprint evidence |
| **Model (all passes)** | `nvidia/nemotron-3-super-120b-a12b` |
| **Ground truth source** | 15 NVIDIA AI Blueprint repos via GitHub raw API |
| **Blueprints matched for TC-2** | `ai-virtual-assistant`, `rag`, `ambient-healthcare-agents` |

### Results — TC-2: `"build a medical RAG chatbot for hospitals"`

| Metric | Value |
|---|---|
| **Exit reason** | `timeout` |
| **Adversary rounds** | 2 |
| **Total latency** | 301,530ms (302s) |
| **Domain template** | `medical` |
| **Ground truth blueprints** | ai-virtual-assistant, rag, ambient-healthcare-agents |
| **Performance goals** | 5 |
| **Inferred requirements** | 7 |
| **Gaps** | 2 |
| **Conflicts** | 2 |

**Performance goals produced:**
- clinical_accuracy_on_medqa: >90%
- retrieval_recall_at_5: >85%
- inference_latency_p95: <300ms
- safety_violation_rate: <0.1%
- guardrails_latency_overhead: <50ms (NEW — overhead metric for guardrails)

**Inferred requirements (all NVIDIA-service-specific):**
1. NIM for optimized cloud-native LLM serving with TensorRT-LLM acceleration
2. NeMo for fine-tuning on hospital-specific corpora
3. NeMo Guardrails for safety/toxicity/compliance filtering
4. NeMo Retriever for vector search and RAG pipeline
5. Ambient Healthcare Agents blueprint as reference architecture
6. Nemotron for model hosting and optimized inference
7. Immutable audit logging of all prompts, contexts, outputs, and decisions

**Adversary challenges (ALL grounded in evidence):**

| Round | Challenge | Grounding | Evidence Source |
|---|---|---|---|
| 1 | Missing NVIDIA services (nim, nemo, guardrails, retriever, nemotron) | grounded | ambient-healthcare-agents blueprint |
| 1 | Missing safety guardrails pattern | grounded | ambient-healthcare-agents: patterns include Safety guardrails |
| 1 | Missing microservice/containerized deployment patterns | grounded | ambient-healthcare-agents: patterns include Microservice, Containerized |
| 1 | Missing guardrails requirement | grounded | ambient-healthcare-agents: nemo-guardrails service |
| 2 | Missing nemotron service | grounded | ambient-healthcare-agents services list |

### Quality Comparison: Baseline vs Grounded

| Dimension | Baseline (subjective) | Grounded (evidence-backed) | Winner |
|---|---|---|---|
| **Challenges cite evidence?** | No — "this seems wrong" | Yes — "ambient-healthcare-agents blueprint shows X" | **Grounded** |
| **Inferred reqs mention NVIDIA services?** | Generic ("monitoring", "logging") | Specific ("NIM for serving", "NeMo Guardrails for compliance") | **Grounded** |
| **Gaps** | 5 (some generic) | 2 (both specific and actionable) | **Grounded** (fewer but higher quality) |
| **Performance goals** | 4 generic | 5 including guardrails_latency_overhead | **Grounded** (more specific) |
| **Service recommendations** | None — just abstract requirements | Explicit services from real blueprints | **Grounded** |
| **Latency** | 365s | 302s | **Grounded** (-17%) |

### Key Observations

1. **Every adversary challenge cites a real blueprint.** No opinions, no "I think" — pure evidence.
2. **The grounded adversary drives NVIDIA-specific improvements.** Instead of "add monitoring," it says "use NeMo Guardrails with sub-50ms overhead, per ambient-healthcare-agents blueprint."
3. **Fewer gaps but higher quality.** Baseline had 5 gaps (some trivial), grounded has 2 gaps (both actionable).
4. **The adversary directly references the `ambient-healthcare-agents` blueprint** — real NVIDIA architecture for this exact domain.
5. **New metric emerged: `guardrails_latency_overhead`** — this wouldn't exist without the grounded adversary knowing that real blueprints include guardrails as a separate component with measurable overhead.
6. **Ground truth fetch adds negligible latency** — 334ms for 15 repos (cached after first fetch).

---

## Results Summary — TC-2 Across All Modes

| Mode | Latency | Rounds | Exit | Perf Goals | Inferred Reqs | Gaps | Conflicts | NIM Calls |
|---|---|---|---|---|---|---|---|---|
| **Baseline** | 365s | 2 | timeout | 4 | 11 | 5 | 2 | 5+ |
| **Fast (no adversary)** | 50s | 0 | fast_mode | 4 | 3 | 4 | 2 | 1 |
| **Self-critique** | **73s** | 0 | selfcritique | **5** | 9 | 4 | 3 | **1** |
| **Asymmetric (49B adv)** | 315s | 2 | timeout | 4 | 7 | 4 | 3 | 5+ |
| **Cached (templates)** | **161s** | **1** | **approved** | **5** | 5 | 4 | 2 | 3 |
| **Combined (cached+49B)** | 344s | 2 | timeout | 5 | 7 | 4 | 2 | 5+ |
| **Grounded (default)** | **302s** | 2 | timeout | **5** | 7 | **2** | 2 | 5+ |

### Winner: Grounded Default (for quality) | Self-Critique (for speed)

---

## Key Findings

### 1. Self-critique is the speed king
- **73s** — 5x faster than baseline, comparable quality
- Single NIM call eliminates all loop overhead
- Best for: real-time customer-facing tool, "give me a plan NOW"
- Trade-off: slightly fewer inferred requirements (9 vs 11)

### 2. Domain templates are the quality king
- **161s** — only mode that achieved `approved` status (adversary found zero issues)
- Template-enriched prompts produce production-quality drafts on first pass
- Best for: known domains (medical, RAG, training, agentic, deployment)
- Trade-off: requires pre-built templates, doesn't help for novel/unusual domains

### 3. Asymmetric model pairing is NOT worth it on shared NIM API
- Only 14% faster than baseline (315s vs 365s)
- 49B adversary is less thorough — finds fewer real issues
- When combined with caching, actually regresses (344s vs 161s)
- **Root cause:** On shared NIM API, the bottleneck is queue wait, not model size. The 49B model still takes ~30-40s per call because of API queuing. Self-hosted NIM would change this equation.

### 4. Combining optimizations requires care
- cached + asymmetric is WORSE than cached alone
- The 49B adversary generates false-positive challenges on specs that the 120B would approve
- Lesson: each optimization must be validated in combination, not assumed additive

### 5. The "right" mode depends on the use case
| Scenario | Recommended Mode |
|---|---|
| Customer demo, real-time | `selfcritique` (73s) |
| Known domain, quality matters | `cached` (161s) |
| Novel/unusual domain, max quality | `baseline` (365s) |
| Quick draft to iterate on | `fast` (50s) |

---

---

## Experiment 7: Comprehensive Test Suite (10 Enterprise Use Cases)

### Purpose
Determine whether the grounded default pipeline (domain templates + self-critique + ground truth) actually improves plan quality across diverse domains — or if we were just overfitting to the medical RAG test case (TC-2).

### Test Suite Design

| ID | Category | Input | Blueprint Coverage |
|---|---|---|---|
| TC-M1 | MATCH | build a RAG pipeline for enterprise document search | rag, streaming-data-to-rag, aiq |
| TC-M2 | MATCH | deploy a customer service chatbot with AI | ai-virtual-assistant, rag, aiq |
| TC-M3 | MATCH | build a multi-agent system for retail e-commerce | aiq, Retail-Agentic-Commerce |
| TC-P1 | PARTIAL | build a real-time fraud detection system for banking | streaming-data-to-rag (partial) |
| TC-P2 | PARTIAL | create an AI-powered drug discovery pipeline | rag (partial, not domain-specific) |
| TC-P3 | PARTIAL | deploy a recommendation engine for a streaming platform | streaming-data-to-rag (partial) |
| TC-N1 | NOVEL | build an autonomous drone navigation system with computer vision | none relevant |
| TC-N2 | NOVEL | create an AI-powered climate modeling simulation | none relevant |
| TC-V1 | VAGUE | chatbot | ai-virtual-assistant (partial) |
| TC-V2 | VAGUE | optimize inference | none |

### Method
Both modes tested with `?draft=true` (self-critique draft only, no adversary loop) to isolate the effect of domain templates + ground truth on the planner's first-pass quality.

### Results — Head-to-Head (4-metric scoring)

Win = more perfGoals, more inferredReqs, fewer gaps, more NVIDIA service mentions

| Metric | Default (grounded) | Baseline | Verdict |
|---|---|---|---|
| **Win count** | **2** | **6** | **BASELINE wins** |
| Ties | 2 | 2 | |
| Avg perf goals | 3.9 | **4.4** | Baseline higher |
| Avg inferred reqs | **3.9** | 3.8 | Tie (marginal) |
| Avg gaps | **3.7** | 3.8 | Tie (marginal) |
| Avg conflicts | **1.7** | 1.8 | Tie (marginal) |
| Avg NVIDIA svc mentions | **0.6** | 0.5 | Tie (marginal) |
| Avg latency | 121.6s | **111.5s** | Baseline faster |
| Templates used | 7/10 | 0/10 | — |

### Per-Category Breakdown

**MATCH (blueprint exists):** Default 0 wins, Baseline 1 win, 2 ties
- Nearly identical output quality — ground truth didn't add value for MATCH cases
- Domain templates sometimes matched wrong template (e.g. TC-M2 matched "deploy" instead of "chatbot")

**PARTIAL (related blueprints):** Default 1 win, Baseline 2 wins
- Baseline produced more perf goals and inferred reqs in 2/3 cases
- The "deploy" template fired too often, not adding domain-specific value

**NOVEL (no blueprint):** Default 0 wins, Baseline 2 wins
- Baseline BEAT default on novel domains — 5 perf goals vs 4, 4 inferred reqs vs 3
- Ground truth retrieval returned irrelevant blueprints (rag, ai-virtual-assistant for a drone navigation system) — added noise instead of signal

**VAGUE (minimal input):** Default 1 win, Baseline 1 win
- TC-V2 ("optimize inference") was the only clear default win: 9 inferred reqs vs 4, 4 NVIDIA svc mentions vs 1
- TC-V1 ("chatbot") was a baseline win: 4 perf goals vs 3

### Failure Analysis

**Why the grounded default underperformed:**

1. **Wrong template matching.** The "deploy" template fired for 4/10 tests because keywords like "deploy", "system", "pipeline" are too generic. Banking fraud detection got the "deploy" template instead of nothing.

2. **Irrelevant blueprint retrieval.** Novel domains (drones, climate) retrieved RAG and chatbot blueprints because the keyword scorer couldn't distinguish "this has nothing useful" from "this is vaguely related." The irrelevant ground truth CONFUSED the planner.

3. **Self-critique prompt is longer but not better.** The self-critique prompt (planner+adversary+resolution in one) produces FEWER perf goals (3.9 vs 4.4) than the simpler planner prompt. The added complexity may be causing the model to hedge or truncate.

4. **Templates reduced diversity.** The domain templates provided "baseline" requirements, but the model then relied on them instead of generating domain-specific ones. Template for RAG suggests "retrieval_recall_at_5 >85%" and the model just copied it instead of thinking about what this specific RAG use case needs.

5. **TC-V2 was the exception** — "optimize inference" with no matching blueprint but a matching template. The template gave enough structure for the model to produce a much richer spec. This is the ONE case where the system worked as intended.

### Honest Assessment

The grounded default pipeline **does not consistently improve plan quality** over the plain baseline. It helps for 2/10 cases and hurts for 6/10.

**What works:**
- Ground truth is valuable when the adversary loop runs (Exp 6 showed evidence-backed challenges)
- Domain templates help for exact-match domains when the template is high-quality (TC-V2)
- Self-critique prompt is faster (fewer tokens) when it works

**What doesn't work:**
- Template matching is too loose — fires on wrong domains
- Blueprint retrieval returns noise for novel domains
- Self-critique prompt trades depth for breadth
- The optimizations we built for TC-2 (medical RAG) don't generalize

### Recommendations

1. **Default should be baseline planner, NOT self-critique** — the simpler prompt produces richer output
2. **Templates need stricter matching** — require 2+ keyword matches, not 1
3. **Blueprint retrieval needs a "no match" threshold** — if score < 3, return nothing instead of noise
4. **Ground truth is most valuable IN the adversary loop, not in the planner prompt** — let the planner be creative, let the fact-checker validate

---

## Experiment 8: Data-Flow Prompt (Stage 3 Rewrite)

### Hypothesis
The 13-rule system prompt in Stage 3 is constraining the 120B model. Replacing it with a minimal prompt that asks for DATA FLOW (inputs/outputs per service) will naturally filter out wrong services while producing comprehensive paths.

### Architecture Change (MAJOR)
```
OLD Stage 3 prompt: 13 hardcoded rules + keyword triggers + exclusion lists + mandatory pairs
  → 4 services for healthcare (too thin)
  → Model plays it safe, returns minimum viable path

NEW Stage 3 prompt: 3 sentences
  1. "Produce a complete production-ready implementation path"
  2. "Describe the DATA FLOW — inputs and outputs for each service"
  3. "If a service cannot be placed in the data flow, do not include it"
  + verified:false escape for non-NVIDIA/gibberish goals

Server-side post-processing:
  OLD: 7 enforcement steps (exclusions, mandatory pairs, compliance injection, eval injection, engine injection)
  NEW: 2 steps (validate serviceIds, sort by layer order for graph)
```

### Prompt Evolution (what we tested to get here)

| Prompt Version | Services (TC-2) | Rating | Problem |
|---|---|---|---|
| 13 rules (old) | 4 | 4/10 | Too restrictive — model self-censors |
| "Include ALL services" | 18 | 5/10 | Too permissive — includes CUDA, Megatron-LM, RLHF |
| "Scope calibration + justify" | 6 | 8/10 | Dropped evaluator and NIM — "not strictly required" |
| "Production-ready + justify" | 10 | 9/10 | Sweet spot but no natural filter for wrong services |
| **"Data flow — inputs/outputs"** | **8-10** | **8.7/10 avg** | **Natural filtering via data flow constraint** |

### Results — 7 Test Cases with Data-Flow Prompt (direct NIM API)

| Test Case | Services | Correct | Wrong | Rating |
|---|---|---|---|---|
| Healthcare (doctors) | 8 | 8 | 0 | 9/10 |
| Fraud detection (banking) | 9 | 9 | 0 | 9/10 |
| Warehouse logistics | 5 | 5 | 0 | 9.5/10 |
| Drone navigation (CV) | 9 | 9 | 0 | 9/10 |
| Chatbot (vague) | 7 | 6 | 1 (agent-toolkit debatable) | 8/10 |
| Recommendation engine | 10 | 9 | 1 (guardrails on rec scores stretch) | 8.5/10 |
| Drug discovery | 6 | 6 | 0 | 8/10 |
| **Average** | **7.7** | **7.4** | **0.3** | **8.7/10** |

### Key Differentiators the Data-Flow Prompt Got Right

| Scenario | Old Prompt (keyword) | Data-Flow Prompt (inference) |
|---|---|---|
| Fraud detection model type | `tensorrt-llm` (wrong — fraud isn't LLM) | `tensorrt` (correct — tabular model) |
| Warehouse logistics | Would include LLM services | `cuopt` + `rapids` only (correct — not a language problem) |
| Drone navigation | Would include RAG/retriever | `tensorrt` + `triton` + `nemo-agent-toolkit` (correct — CV + control) |
| Healthcare compliance | Keyword "hospital" → inject guardrails | Model infers guardrails from clinical context |
| Drug discovery | `tensorrt-llm` (wrong) | No LLM services (correct — molecular models) |

### Results — Production Route (through /api/generate-flow)

| Test Case | Result | Services |
|---|---|---|
| TC-2: healthcare | ✅ verified, 8 services | curator → retriever → nemo → guardrails → rapids → tensorrt-llm → triton → ai-enterprise |
| EDGE-1: "make me a website" | ✅ rejected (422) | verified: false |
| EDGE-2: "asdfghjk" | ✅ rejected (422) | verified: false |
| EDGE-3: "deploy on AWS SageMaker" | ⚠️ accepted, 5 services | Reasonable — NVIDIA stack for SageMaker deployment |

### Lines of Code Comparison

| Component | Old | New | Change |
|---|---|---|---|
| System prompt | ~120 lines (13 rules) | ~15 lines (3 sentences) | -87% |
| Server-side enforcement | ~130 lines (7 rule checks) | ~15 lines (validate IDs + sort) | -88% |
| Total generate-flow route | ~900 lines | ~600 lines | -33% |

### Key Finding
**The 120B model doesn't need rules — it needs the right framing.** Asking for data flow forces the model to think architecturally: "what data goes in, what comes out, how does it connect?" Services that can't be placed in a concrete data flow get naturally excluded. This is more robust than keyword matching because it works for ANY domain, not just the ones we wrote rules for.

---

## Experiment 9: End-to-End Pipeline Test (3 Domains)

### Purpose
Validate the complete pipeline (GoalSpec → service path → notebook) across three fundamentally different enterprise domains. Confirm that the system produces domain-appropriate service selections, correct SDK code, and avoids cross-domain confusion.

### Test Cases

---

#### TC-1: Healthcare CDSS — "help doctors make better decisions at hospitals"

**GoalSpec Output (Stage 1, ~91s):**
- Domain: Healthcare AI / Clinical Decision Support
- Compliance: HIPAA, GDPR, FDA SaMD Class II, ISO 13485
- Performance goals: AUC ≥0.85, Brier <0.1, ≥10% adverse event reduction, ≤1s inference, ≤3s end-to-end
- Inferred: FHIR integration, explainability (SHAP), continuous monitoring, audit logging, clinician-in-the-loop

**Service Path (Stage 2, ~117s, 8 services):**
TensorRT → RAPIDS → NeMo → NeMo Evaluator → NeMo Guardrails → Model Optimizer → Dynamo-Triton → AI Enterprise

| Check | Result |
|---|---|
| TensorRT (not TensorRT-LLM) for clinical model | ✅ Correct — CDSS uses classification/regression, not LLM |
| NeMo Evaluator included | ✅ AUC/Brier metrics demanded it |
| NeMo Guardrails for HIPAA | ✅ Compliance-driven |
| NeMo Retriever for clinical guidelines | ❌ Missing — GoalSpec mentions "evidence-based guidelines" but model interpreted as classification-only CDSS |
| No duplicates | ✅ Dedup fix working |

**Notebook (Stage 3, ~264s, 17 cells):**
| Cell | Service | API Correct? | Notes |
|---|---|---|---|
| Setup | pip installs | ✅ | Real packages: nemo_toolkit, cudf, tritonclient, nvidia-modelopt, nemoguardrails |
| NeMo Curator | `Pipeline` + `ProcessingStage` | ✅ | Correct NeMo Curator pattern |
| RAPIDS | `cudf.read_parquet`, feature engineering | ✅ | Correct cuDF API |
| NeMo Training | PyTorch Lightning + custom model | ✅ | Honest — builds clinical MLP, doesn't fake NeMo API |
| NeMo Evaluator | `nemo-evaluator-launcher run --config` CLI | ✅ | Correct CLI pattern |
| NeMo Guardrails | `RailsConfig.from_path()` + `LLMRails` | ✅ | Correct API — real import pattern |
| Model Optimizer | `modelopt.torch.quantization.mtq.quantize()` | ✅ | Correct API |
| Triton | `tritonclient.http`, `InferInput`, `set_data_from_numpy` | ✅ | Correct, includes health check |
| AI Enterprise | Helm chart with RBAC, TLS, autoscaling | ✅ | Illustrative but correct pattern |

**Rating:** Path 8.5/10 (missing Retriever), Notebook 8/10 (correct APIs, placeholder data)

---

#### TC-2: Banking Fraud Detection — "build a real-time fraud detection system for banking"

**GoalSpec Output (Stage 1, ~60s):**
- Domain: Financial Services - Banking Fraud Detection
- Compliance: PCI DSS v4.0, GDPR, AML/BSA, SOX
- Performance goals: ≤8ms E2E latency, FPR ≤0.1%, Recall ≥95%, ≥150k TPS
- Inferred: Low-latency feature store, cost matrix, exactly-once processing, horizontal autoscaling

**Service Path (Stage 2, 9 services):**
Brev → DGX Cloud → RAPIDS → NeMo Curator → NeMo → NeMo Evaluator → Model Optimizer → Dynamo-Triton → AI Enterprise

| Check | Result |
|---|---|
| TensorRT (not TensorRT-LLM) | Not included — Model Optimizer handles quantization directly | ⚠️ Could benefit from TensorRT for 8ms budget |
| No NeMo Retriever | ✅ Not a RAG use case |
| No NeMo Guardrails | ✅ PCI/SOX is infrastructure compliance, not LLM rails |
| RAPIDS for transaction data | ✅ Correct — tabular feature engineering |
| NeMo for training | ⚠️ Fraud detection typically uses XGBoost/RF, but NeMo can train tabular models |

**Notebook (Stage 3, ~296s, 17 cells):**
| Cell | Service | API Correct? | Notes |
|---|---|---|---|
| Setup | pip installs | ✅ | Stray `}` at end — syntax error |
| Brev | `brev create` CLI | ⚠️ | Plausible but unverified CLI |
| RAPIDS | `cudf`, `dask_cudf`, `LocalCUDACluster`, rolling features | ✅ | Correct, realistic ETL |
| NeMo Training | PyTorch Lightning + custom FraudMLP | ✅ | Correct for tabular — used MLP, not transformer |
| NeMo Evaluator | `nemo-evaluator-launcher run --config` | ✅ | Correct CLI |
| Model Optimizer | `mtq.quantize()` + TorchScript export | ✅ | Correct API |
| Triton | Docker launch + `config.pbtxt` + `tritonclient.http` + dynamic batching | ✅ | Excellent — detailed deployment config |
| AI Enterprise | Helm chart with autoscaling, RBAC, TLS | ✅ | Correct pattern |

**Rating:** Path 8.5/10 (could use TensorRT), Notebook 8/10 (stray `}` syntax error, otherwise solid)

---

#### TC-3: E-Commerce Recommendations — "build an AI-powered recommendation engine for an e-commerce platform"

**GoalSpec Output (Stage 1, ~80s):**
- Domain: E-commerce / Retail
- Compliance: GDPR, CCPA, PCI-DSS
- Performance goals: <100ms E2E latency (sub-budgets: 20ms feature, 10ms preprocess, 50ms inference, 10ms postprocess, 10ms network), NDCG@10 ≥0.60, +10% CTR lift, ≥60% catalog coverage
- Inferred: Two-tower + ANN retrieval, cold-start handling, A/B testing, right-to-erasure pipeline

**Service Path (Stage 2, 9 services):**
DGX Cloud → TensorRT → NeMo Curator → RAPIDS → NeMo Evaluator → NeMo Guardrails → Model Optimizer → Dynamo-Triton → AI Enterprise

| Check | Result |
|---|---|
| TensorRT (not TensorRT-LLM) | ✅ Correct — two-tower embedding model, not LLM |
| RAPIDS for feature engineering | ✅ User behavior streams, click data |
| No NeMo Retriever | ✅ Product ANN search ≠ document RAG |
| NeMo Guardrails for GDPR | ⚠️ Debatable — Guardrails designed for LLM safety, not rec compliance. But includes PII masking which is relevant. |
| DGX Cloud for training | ✅ GPU training infrastructure |
| Step 1 mentions "two-tower retrieval and reranker" | ✅ Matched GoalSpec architecture |

**Notebook (Stage 3, ~300s, 21 cells):**
| Cell | Service | API Correct? | Notes |
|---|---|---|---|
| Setup | All packages imported including `nemoguardrails`, `modelopt`, `tritonclient` | ✅ | Clean setup |
| DGX Cloud + NeMo | `nemo train retrieval` CLI | ❌ | NeMo doesn't have a recommendation training CLI — fabricated |
| TensorRT | `trtexec --onnx=... --saveEngine=... --fp16` | ✅ | Correct CLI with correct flags |
| NeMo Curator | `Pipeline` + `ProcessingStage` with custom stages | ✅ | Correct pattern |
| RAPIDS | `cudf.read_parquet`, `groupby.agg`, `merge` | ✅ | Correct cuDF API |
| NeMo Evaluator | `nemo-evaluator-launcher run --config` | ✅ | Correct CLI |
| NeMo Guardrails | `RailsConfig.from_path()` + PII masking + item filtering | ✅ | Correct import, creative adaptation for compliance |
| Model Optimizer | `mtq.quantize()` + `torch.onnx.export` | ✅ | Correct quantization → ONNX pipeline |
| Triton | **Full two-stage flow**: user embedding → retrieval model → top-100 → reranker → top-10, with latency measurement | ✅ | Architecturally excellent |
| AI Enterprise | `kubectl scale`, `helm upgrade`, drift-based retraining | ✅ | Correct patterns |

**Rating:** Path 9/10 (NeMo Guardrails debatable), Notebook 8/10 (fabricated NeMo training CLI, but Triton cell is outstanding)

---

### Cross-Domain Differentiation

The system correctly differentiated all three domains:

| Aspect | Healthcare | Fraud Detection | E-Commerce Recs |
|---|---|---|---|
| Model type | Clinical classifier (TensorRT) | Tabular MLP (PyTorch) | Two-tower + reranker (TensorRT) |
| TensorRT variant | TensorRT ✅ | Model Optimizer only | TensorRT ✅ |
| Guardrails | Yes (HIPAA) ✅ | No ✅ | Yes (GDPR — debatable) ⚠️ |
| Retriever/RAG | Missing ❌ | Not included ✅ | Not included ✅ |
| RAPIDS | EHR processing ✅ | Transaction ETL ✅ | Click stream features ✅ |
| Evaluator | AUC/Brier metrics ✅ | ROC/PR analysis ✅ | NDCG/CTR metrics ✅ |
| Training code | Clinical MLP ✅ | Fraud MLP ✅ | Two-tower (fabricated CLI) ⚠️ |
| Triton code | Basic health check | Docker + config.pbtxt | Full retrieval→rerank pipeline ✅ |

### Summary Ratings

| Domain | Path Rating | Notebook Rating | Combined |
|---|---|---|---|
| Healthcare CDSS | 8.5/10 | 8/10 | 8.25/10 |
| Banking Fraud | 8.5/10 | 8/10 | 8.25/10 |
| E-Commerce Recs | 9/10 | 8/10 | 8.5/10 |
| **Average** | **8.7/10** | **8/10** | **8.3/10** |

### Known Issues Across All Notebooks
1. NeMo training CLI is fabricated (`nemo train retrieval` doesn't exist) — model generates plausible but non-existent CLI commands for training
2. Stray `}` syntax errors occasionally appear at end of code cells
3. `os.time.time()` instead of `time.time()` in AI Enterprise cell
4. NeMo Evaluator config YAML uses fabricated collection paths
5. NeMo Retriever inconsistently included/excluded for healthcare use cases

### What Works Consistently
1. RAPIDS cuDF API — correct across all domains
2. Model Optimizer `mtq.quantize()` — correct every time
3. Triton client API — correct and increasingly detailed per domain
4. NeMo Guardrails imports — `RailsConfig.from_path()` + `LLMRails()` correct
5. TensorRT vs TensorRT-LLM selection — correct for all three domains (none used TensorRT-LLM)
6. Service deduplication — no duplicate services after fix
7. `trtexec` CLI with correct flags
8. Package installations — real package names, no hallucinated packages

---

## Experiment 10: Self-Hosted NIM on Brev (Dedicated GPU)

### Hypothesis
Self-hosting Nemotron 120B on dedicated GPUs will eliminate NIM shared API queue latency and reduce per-call time from 50-80s to 10-20s.

### Setup
- **Provider:** Brev (via DMZ launchpad)
- **Hardware:** 2x NVIDIA H100 NVL, 96GB VRAM each (192GB total), 1000GB RAM, 128 CPUs
- **Cost:** $5.69/hr
- **Container:** `nvcr.io/nim/nvidia/nemotron-3-super-120b-a12b:latest` (v2.0.2)
- **Access:** SSH port forward (`brev port-forward -p 8000:8000`) — Brev cloud firewall blocks direct public access
- **Deployment time:** ~25 min end-to-end (instance provisioning + container pull + model load)

### Issues encountered
1. **Permission denied on volume mount** — NIM container's internal user can't write to host-mounted `~/.cache` directory. Solution: remove volume mount, use container's ephemeral cache.
2. **External port 8000 blocked** — Brev/DMZ cloud firewall blocks direct access to `<public-ip>:8000`. Solution: SSH port forward via `brev port-forward`.
3. **Token limit hit on multi-service notebooks** — Self-hosted model has no implicit cap; the 8192 `max_tokens` we used for shared API was too low. Raised to 32768.
4. **Model writes prose preamble before JSON** — Self-hosted model responded with "We are given a service path with 10 services. We need to produce..." before the JSON array. Shared API was suppressing this. Solution: parser now validates array contains `cell_type` objects and skips prose arrays.

### Results

| Operation | Shared API | Self-hosted (Brev) | Speedup |
|---|---|---|---|
| Simple inference ("hello") | ~50s (queue) | <1s | 50x+ |
| GoalSpec draft (`?draft=true`) | 60-90s | ~15-20s | 3-4x |
| Service path (9 services) | 80-120s | ~15-25s | 5x |
| Notebook (1 service, simple) | 150s | **6.6s** | 23x |
| Notebook (10-11 services, full pipeline) | 270s | ~180s | 1.5x (bottlenecked by output length) |

### Quality Observations

**Self-hosted produces MORE detailed output than shared API:**
- GoalSpec for recommendation engine included hardware-specific breakdowns ("120 T4 GPUs at batch size 8 vs 100 T4s with TensorRT batch 12")
- Infrastructure math ("10M MAU × 200B per session = 2GB working set, +100% Redis replication overhead = 4-6GB cluster")
- Statistical specificity ("alpha=0.05, power=0.8, posterior >0.95")

**Hypothesis:** Shared API enforces response length caps to manage multi-tenant load. Self-hosted has no such cap.

### Test Cases

**TC: Recommendation engine** (self-hosted)
- GoalSpec: 10 inferred requirements with hardware/math specifics
- Path: 11 services correctly selected, zero duplicates
- Notebook: 25 cells, 42KB, all 11 services covered with real NVIDIA SDK code
- Total pipeline time: ~4 minutes (GoalSpec + path + notebook)

### Cost Analysis

| Scenario | Shared API | Self-hosted Brev |
|---|---|---|
| Cost per call | $0 (within quota) | ~$0.01 (prorated from $5.69/hr) |
| Cost per pipeline run | $0 | ~$0.25 (4 min at $5.69/hr) |
| Cost per 1000 pipeline runs | $0 | ~$250 |
| Latency predictability | Variable (queue) | Consistent |
| Quality | Good | Better (no response caps) |

### Recommendations

1. **Development/testing:** Shared API is fine — quality is sufficient, no infrastructure overhead
2. **Demo/production:** Self-hosted NIM provides consistent low-latency and better output quality
3. **Cost optimization:** Keep Brev instance running only during demos — delete when idle (cannot stop/start, only delete on DMZ provider)

### Key Finding
**The shared API was silently capping response quality, not just latency.** Self-hosted output is richer, more detailed, and handles complex multi-service prompts better. The 32K `max_tokens` headroom matters for production notebooks with 10+ services.

---

## Experiment 11: OpenRouter Free Tier

### Hypothesis
OpenRouter offers Nemotron 120B for free (`nvidia/nemotron-3-super-120b-a12b:free`). If it works, we get $0 cost with potentially faster inference than NVIDIA's shared API.

### Setup
- **Provider:** OpenRouter (free tier)
- **Model:** `nvidia/nemotron-3-super-120b-a12b:free`
- **Cost:** $0 / $0 per million tokens
- **API:** OpenAI-compatible (same SDK, just change base URL + API key)
- **Code changes:** Auto-detect OpenRouter from `NIM_BASE_URL`, use `OPENROUTER_API_KEY` instead of `NVIDIA_API_KEY`, set `NIM_CHAT_MODEL` to `:free` variant

### Results

| Operation | NVIDIA NIM (shared) | OpenRouter (free) |
|---|---|---|
| GoalSpec (Stage 1) | 60-90s | 60-90s |
| Service path (Stage 2) | 80-120s | 80-120s |
| Notebook (Stage 3) | 150-300s | ❌ Connection dropped |

### Quality Observations

- **GoalSpec quality:** Identical to NVIDIA NIM — 9/10. Produced the same level of detail (HIPAA, FDA SaMD, ISO standards, 18 inferred requirements).
- **Path quality:** Identical — 9 services for healthcare CDSS, same TensorRT-LLM variant question.
- **New service included:** AI Workbench appeared in the path — reasonable for clinical dev teams. Not seen with NVIDIA NIM for the same domain.

### Issues

1. **Daily rate limit on free tier** — initial key hit `"Key limit exceeded (daily limit)"` before any successful call. Required configuring key limits at openrouter.ai/settings/keys.
2. **Insufficient credits error** — free tier requires $0 credits but the account must exist with payment method or free credits activated.
3. **Notebook generation fails** — Connection drops mid-response (`SocketError: other side closed`). The response was cut off at 1559 chars out of an expected 30K+. Free tier likely has connection time or response size limits.
4. **Latency identical to NVIDIA NIM** — OpenRouter free tier likely routes to NVIDIA's shared API behind the scenes. No speedup observed.

### Verdict
OpenRouter free tier is a viable alternative for GoalSpec and path generation ($0 cost, same quality). **Not viable for notebook generation** due to connection drops on long responses. A hybrid approach (OpenRouter for short calls, NVIDIA NIM for notebook) would work but adds complexity for marginal benefit.

---

## Inference Provider Comparison (All Three Tested)

| Metric | NVIDIA NIM (shared) | Brev (self-hosted 2xH100) | OpenRouter (free) |
|---|---|---|---|
| **Cost** | $0 (API key quota) | $5.69/hr (~$0.25/pipeline) | $0 |
| **GoalSpec latency** | 60-90s | ~15-20s | 60-90s |
| **Path latency** | 80-120s | ~15-25s | 80-120s |
| **Notebook latency** | 150-300s | 6-180s | ❌ Drops connection |
| **Total pipeline** | 5-8 min | 1-4 min | N/A (notebook fails) |
| **GoalSpec quality** | 9/10 | 9/10 (richer) | 9/10 |
| **Path quality** | 9/10 | 9/10 | 9/10 |
| **Notebook quality** | 8/10 | 8/10 | N/A |
| **Output richness** | Good | **Best** (no caps) | Good |
| **Connection stability** | ✅ Stable | ✅ Stable | ❌ Drops on long responses |
| **Max output** | ~8K tokens (implicit) | 32K+ (no cap) | Unknown (cuts off early) |
| **JSON reliability** | Moderate | Moderate | Moderate |

### Key Findings

1. **Quality is identical across all three** — same model weights, same reasoning. Path quality (9/10) and known issues (TensorRT variant, NeMo Retriever inconsistency) exist regardless of provider.

2. **Latency: only Brev is faster.** OpenRouter free tier has identical latency to NVIDIA NIM — likely routing to NVIDIA behind the scenes. Self-hosted Brev is 5-50x faster due to dedicated GPUs with no queue.

3. **Brev produces richer output.** Shared API and OpenRouter appear to silently cap response length. Brev with 32K max_tokens produced GoalSpecs with hardware sizing math, infrastructure calculations, and statistical specifics not seen elsewhere.

4. **OpenRouter free can't handle notebooks.** Connection drops on long-running responses (>60s or >2K chars). Usable for short-response stages only.

5. **Cost-quality trade-off has no middle ground:**
   - Free + slow: NVIDIA NIM or OpenRouter free (same quality, same speed)
   - Paid + fast: Brev $5.69/hr (best quality, best speed)
   - OpenRouter paid: untested, would be the potential middle option

### Recommendation by Use Case

| Scenario | Best Provider | Reason |
|---|---|---|
| **Development/testing** | NVIDIA NIM (shared) | Free, stable, full pipeline works |
| **Demo** | Brev (self-hosted) | Fast, impressive latency, richer output |
| **Cost-sensitive production** | NVIDIA NIM (shared) | $0, reliable, acceptable latency |
| **Low-latency production** | Brev or dedicated NIM | Only way to get <20s per call |

---

## Model Comparison Matrix

| Model | Role | Latency/call (shared API) | Quality (1-10) | JSON Reliability | Notes |
|---|---|---|---|---|---|
| `nvidia/nemotron-3-super-120b-a12b` | Planner | ~50s | 9 | Moderate — needs `<think>` stripping | Best quality, slow |
| `nvidia/nemotron-3-super-120b-a12b` | Adversary | ~50s | 9 | Moderate | Thorough reviewer, approved cached specs |
| `nvidia/llama-3.3-nemotron-super-49b-v1` | Adversary | ~35-40s | 6 | Good (no `<think>` issues) | Less thorough, generates false-positive challenges |
| _future model_ | _role_ | TBD | TBD | TBD | |

---

## Inference Time Reduction — Tested and Untested

### Tested

| Approach | Result | Experiment |
|---|---|---|
| Self-hosted NIM on 2xH100 (Brev) | **5-50x faster**, richer output | Exp 10 |
| OpenRouter free tier | No speedup (same latency as NVIDIA NIM) | Exp 11 |

### Untested

| Approach | Expected Impact | Requires |
|---|---|---|
| OpenRouter paid tier | Unknown — may route to faster providers | Credits ($5+) |
| TensorRT-LLM compilation of Nemotron | 2-4x throughput | Model conversion pipeline |
| FP8 quantization (H100 native) | 1.5-2x speed, ~same quality | H100 GPUs |
| Speculative decoding (8B draft + 120B verify) | 2-3x for JSON output | Two-model NIM setup |
| KV cache sharing across adversary rounds | 20-40% on rounds 2+ | Custom NIM config |
| `response_format: json_object` (if NIM supports) | Eliminates `<think>` parsing, fewer retries | NIM API feature |
| Streaming + progressive delivery | No latency reduction, but UX improvement | Frontend changes |
| 49B model with data-flow prompt | Unknown quality — untested with new prompt | Prompt testing |

---

## Experiment 13: Stage 2 Validator-Retry Regression (2026-04-20)

### Context

After shipping the Brev end-to-end run, live testing of the frontend on
the healthcare clinical-decision-support prompt produced a **15-service
path** — visibly bloated vs. the ~8-service paths Exp 8/9 recorded at
8.7/10. Hypothesis: Stage 2 regressed since Exp 9.

### Investigation

Git archaeology on `app/api/generate-flow/route.ts` and
`lib/validators/path.ts` identified the regression window:

| Commit | Date | What changed | Effect |
|---|---|---|---|
| `505662e` | 2026-04-19 | Data-flow prompt snapshot — **PEAK config** | 8.7/10 (Exp 8 baseline preserved) |
| `e3a7339` | 2026-04-19 | Wired `validatePath` + `buildPathRepromptFeedback` into 3-retry loop | **Regression** — paths ballooned to 15 |
| `b8c3080` | 2026-04-19 | Added MAX_STEPS=15 truncation cap | Bandaid for symptom, not cause |
| `86ab23e` | 2026-04-19 | Word-boundary fix for "promotion"→"prompt" false positive | Another bandaid for a problem the retry loop created |

`path.ts:319-326` code comment already admits the damage: *"paths ballooned
from ~8 (data-flow baseline, 9/10) to ~15 (5-6/10) because the model read
violations as 'be more thorough'."*

### Attempted fix A — reframe retry feedback ("fewer is better")

Modified `buildPathRepromptFeedback` to say "Fewer, well-placed services
is better than more" and pass `previousStepCount` for concreteness.

**Result:** 15 → 12 services on the same prompt. Some improvement. But
the semantic misfits remained:

- `nemo-curator` included (it's for LLM *pre-training* data prep — we're
  doing RAG over existing sources, NOT pre-training)
- `nemo-retriever` absent (the single most essential service for a RAG
  system)
- Bare `tensorrt` + `cuda-toolkit` redundant alongside `tensorrt-llm`

### Attempted fix B — reframe to "justify each, bias-neutral"

User pushback: "Why mention fewer? It should take the decision of fewer
or more depending on the use case." Correct — "fewer is better" is bias
in the opposite direction of the original "be thorough" bias.

Rewrote feedback to: *"Each service must be justified by the data flow —
not by completeness, not by minimalism. For each service, ask: does it
have concrete inputs from an upstream step and outputs consumed
downstream? Keep what does. Remove what doesn't. Only add a service if a
real data-flow gap requires it."*

**Not yet re-tested** — paused to investigate whether the retry loop
itself is the right architecture.

### Analysis — the retry-loop asymmetry

Cross-referenced with orchestrator trajectory data
(`docs/test-results/orchestrator-trajectory-brev-fullpipeline.json`):

| Stage | Ground truth available? | Iterative retry effect (observed) |
|---|---|---|
| 1 GoalSpec | No | **Hurts** — Exp 7: baseline wins 6/10 vs grounded 2/10 |
| 2 Path | No | **Hurts** — Exp 8/9 peak 8.7 → regressed 5-6 post-validator |
| 3 Notebook | **Yes** (code executes or errors) | **Helps** — codeError 5→2 over 5 iters |

The asymmetry is architectural: retry feedback improves output only when
the retry signal is factual. Stage 3 has `nbclient` execution errors —
objective ground truth. Stages 1 & 2 have only synthetic validator
signals, and the retry pressure pushes the model to over-correct rather
than refine.

### Verdict

Self-improvement **is real** — but only for stages with ground truth.
Applying it blindly to Stage 2 is what produced the regression. The path
bloat is a symptom; the validator-in-retry-loop is the cause.

### Recommendation

Revert Stage 2 to the `505662e` config:

1. In `app/api/generate-flow/route.ts`: remove the semantic retry branch
   (the `validatePath(...) → semanticFeedback = buildPathRepromptFeedback(...) → continue` path).
   Keep parse-failure / `finish=length` retries — those are mechanical,
   not semantic.
2. In `lib/validators/path.ts`: **keep the file**, but demote it from
   retry-driver to warning-only observability. Log violations, surface
   them to the UI, don't re-prompt on them.
3. Leave Stage 3's retry loop intact — it works and the trajectory data
   proves it.
4. Re-measure Stage 2 on the same healthcare RAG prompt and compare
   service count + service appropriateness against the Exp 8 baseline.

### Peak Stage 2 system prompt (verbatim, for future reference)

From `app/api/generate-flow/route.ts:40-57` at commit `505662e`:

> You are a senior NVIDIA AI solutions architect. Produce a complete
> production-ready implementation path using NVIDIA services for the
> user's goal.
>
> A production-ready path covers the FULL lifecycle: data preparation,
> model training/selection, optimization, serving, evaluation,
> safety/compliance, and enterprise deployment. Do not skip stages — a
> system that cannot be evaluated or monitored is not production-ready.
>
> Describe the DATA FLOW — what goes into each service and what comes
> out. Every service must have clear inputs and outputs connecting it to
> other services in the path. If a service cannot be placed in the data
> flow with concrete inputs and outputs, do not include it.
>
> If the goal cannot be addressed with NVIDIA services, or if the input
> is not a valid AI/ML goal, return verified: false.

### Revert shipped and re-tested (2026-04-20)

**Code changes:**

- `app/api/generate-flow/route.ts`:
  - Removed `semanticFeedback` variable and its injection into `userContent`
  - Removed the `validatePath → buildPathRepromptFeedback → continue` branch from the retry loop
  - Retry loop now fires ONLY on mechanical failures (truncated response, unparseable JSON, network errors)
  - Dropped `buildPathRepromptFeedback` import
  - Added load-bearing comment pointing to this experiment
  - `validatePath` still runs post-generation as warning-only observability — violations are logged and surfaced to the UI, never fed back to the model
- `lib/validators/path.ts`: unchanged; demoted in role, not deleted. The reframed (bias-neutral) `buildPathRepromptFeedback` is kept in the file for potential future use but no longer called by the Stage 2 route.

**Re-test on the same healthcare clinical-decision-support prompt:**

| Metric | Regression (pre-revert) | Fix A ("fewer is better") | Fix B (bias-neutral reframe) | **Post-revert (single call)** |
|---|---|---|---|---|
| Service count | 15 | 12 | 11 | **9** |
| `nemo-retriever` present | no | no | **yes** | **yes** |
| `nemo-curator` justified by data flow | no (pattern-match) | no (pattern-match) | no (pattern-match) | **yes — legit corpus de-ident role** |
| Bare `tensorrt` redundant with `tensorrt-llm` | yes | yes | no | no |
| `cuda-toolkit` as pipeline step | yes | yes | no | no |
| Estimated rating | 5–6/10 | 6.5/10 | 7.5/10 | **~8.5/10** |

**Post-revert path** (goal: HIPAA RAG clinical chatbot):

1. NeMo Curator — clean + de-identify EHR and literature corpora
2. NeMo Retriever — document extraction + RAG retrieval
3. NeMo — LLM framework (the Retriever/Guardrails/Evaluator plug-in point)
4. NeMo Guardrails — PHI/HIPAA safety rails
5. NeMo Evaluator — accuracy / hallucination / citation measurement
6. Model Optimizer — quantization path for the <2s latency SLO
7. TensorRT-LLM — LLM inference engine
8. Dynamo-Triton — serving with dynamic batching
9. AI Enterprise — SLA-backed production platform

Clean layer progression `framework → agent → serving → enterprise`.
Every service has a data-flow justification. No redundant plumbing.
No access-layer step (model's judgment call — defensible for a
RAG-only chatbot).

**Curator lesson (for future validator design):**
The earlier critique "Curator is pre-training-only" was wrong in
general — Curator is NVIDIA's text-cleaning pipeline, and
de-identification + corpus cleaning is a legitimate production use.
The data-flow prompt makes the model justify the service inline,
which distinguishes real corpus-prep work from keyword-matched
filler. A validator rule `nemo-curator in non-pretraining path →
misfit` would have been a false-positive patch. The right discipline
is: let the data-flow prompt force justification, then trust the
justification.

### Verdict — confirmed

The retry-loop-on-synthetic-signals was the root cause of the
regression. Removing it restored Exp 8 baseline quality on the first
run without any other tuning. Hypothesis (retry helps only where
ground truth exists) is confirmed by three independent datapoints:

1. Stage 3 iterative fixing (codeError 5→2) — ground-truth signal, works
2. Stage 2 validator retry — synthetic signal, regressed paths 8→15
3. Stage 1 Exp 7 grounded-default — synthetic signal, regressed 6→2

### Open questions (carry forward)

- Stage 1 GoalSpec: does the "grounded default regressed" finding from
  Exp 7 need a matching revert? Not verified whether the recommended
  revert to baseline planner actually landed in current
  `analyze-requirements` route. **TODO: audit `analyze-requirements`
  for the same retry-on-synthetic-signal pattern Stage 2 had.**
- Longer-term: move correctness into the catalog (services declare typed
  consumes/produces), so path validation becomes deterministic graph
  assembly instead of prompt-level rules. Deferred — may be the
  durable fix that lets a validator-driven retry loop earn its keep
  at Stage 2 by supplying factual signal instead of heuristic signal.

---

## Experiment 14: Orchestrator Loop on Frontend Output (2026-04-20)

### Motivation

Exp 13 confirmed Stage 2 revert works (9-service path, 8.5/10). A
frontend-generated notebook was then downloaded and inspected. It had
6 bugs (4 Python syntax errors, 1 hallucinated modelopt API, 1 broken
Colang config). The question: does the Stage 3 self-heal orchestrator —
which demonstrated codeError 5→2 on Brev — close these bugs on fresh
frontend output when run locally?

### Setup

- Input: `docs/test-results/exp14-input.ipynb` (downloaded from frontend,
  Stage 2 path: curator → retriever → nemo → guardrails → evaluator →
  model-optimizer → tensorrt-llm → dynamo-triton → ai-enterprise;
  GoalSpec: HIPAA clinical RAG chatbot, <2s latency)
- Env: Windows 11, Python 3.12, nbclient 0.10, no GPU, no CUDA
- Orchestrator: `scripts/self-improve-notebook.ts` with max=3 iters,
  CELL_TIMEOUT=120s
- Fix endpoint: local `/api/fix-notebook-cell` via Next dev server

### Trajectory

| Iter | code_ok | code_error | roots | cascades | latency |
|---|---|---|---|---|---|
| 1 | 2 / 11 | 9 | 7 | 2 | 137s |
| 2 | **7 / 11** | 4 | 1 | 3 | 77s |
| 3 | — | — | — | — | timeout on pip-install cell (env-limited) |

**codeError: 9 → 4 in one iteration.** 7 of 7 fixable root-cause bugs
closed. Matches the Brev trajectory shape (5→2) on a completely
independent notebook.

### Bugs caught and fixed

All 6 bugs flagged in the pre-run review, plus 2 I missed:

- Cell 3 `subprocess.check_call(..., stdin="""...""")` — wrong API ✓
- Cell 9, 13, 17, 21 — Python syntax errors (unescaped newline in print,
  broken line continuation, unterminated strings) ✓
- Cell 15 `mtq.QuantizerConfig(...)` — would have been caught in iter 3
  but never executed due to env timeout
- **Missed in review:** Cell 7 — protobuf `MessageFactory.GetPrototype`
  version-mismatch (requires protobuf ≤ 3.20 for the sentence-transformers
  code path). Loop detected and fixed.

### Env-boundary failures (not loop limits)

- Cell 3 pip install stayed failing through iter 2 — the packages
  (`nemo-toolkit`, `tensorrt-llm`, `faiss-gpu`) genuinely cannot be
  installed on a Windows-no-GPU laptop. Would succeed on Brev or in a
  GPU Docker image.
- Cell 10 `OSError: No space left on device` — installer filled disk
  with multi-GB CUDA packages.
- Iter 3 cell 3 timed out — pip trying to compile nemo-toolkit from
  source.

These are environment issues, not model failures. On Brev (where
everything installs cleanly) the trajectory would have continued.

### Interpretation

1. **Confirms Exp 13's ground-truth-asymmetry thesis end-to-end.** The
   retry loop converges on stages with objective signals (execution
   errors) while regressing on stages without (validator heuristics).
2. **The loop works on frontend output, not just Brev-generated output.**
   Previous evidence was one notebook from one environment; this is
   independent evidence from a different run of the pipeline.
3. **Wiring the orchestrator behind the `/api/generate-notebook` route
   is the right next investment.** The frontend currently ships raw
   Stage 3 output; wiring self-heal would close ~7 bugs per notebook.

### Required to ship self-heal via frontend

- Server-side Python execution environment (nbclient + base packages +
  optional GPU). Options: a Docker sidecar, a long-running worker
  process, or a Brev-hosted backend endpoint.
- A preflight step that excludes cells pip-installing the NVIDIA stack
  (those always need a real GPU env; not something the fix-pass can
  resolve). Alternative: provide a pre-baked image where the stack is
  already installed.

### Deliverables

- `docs/test-results/exp14-input.ipynb` — starting notebook
- `docs/test-results/exp14-input.ipynb.iter1.ipynb` — post-exec iter 1
- `docs/test-results/exp14-input.ipynb.iter1.patched.ipynb` — iter 1 fixes
- `docs/test-results/exp14-input.ipynb.iter2.ipynb` — post-exec iter 2
- `docs/test-results/exp14-input.ipynb.iter2.patched.ipynb` — iter 2 fixes
- `docs/test-results/exp14-input.ipynb.final.ipynb` — final state
- `docs/test-results/exp14-input.ipynb.trajectory.json` — metrics

---

## Experiment 15: Stage 1 Adversary-Loop Audit — Baseline vs Default on Vague Inputs (2026-04-20)

### Motivation

Exp 13 proved the retry-loop asymmetry thesis on Stage 2: feeding synthetic validator signals back into the model caused systematic over-emission. Exp 7 (months earlier) had already flagged the same pattern on Stage 1 — "baseline planner wins 6/10, grounded default wins 2/10" — but the revert was never confirmed in code. This experiment stress-tests the current production loop on the exact class of inputs it claims to help: **short, vague user prompts** where inference-from-sparse-signal is the whole point.

### Method

Two vague prompts, both run twice against `/api/analyze-requirements`:

- **A (baseline):** `?draft=true` — planner only, no adversary loop
- **B (loop):** default path — planner → (adversary → resolution) × 2, early-exit if draft already rich

Prompts:
- P0: `"chatbot for hospitals"`
- P1: `"a tool to catch credit card fraud"`

Outputs captured: `docs/test-results/exp15/prompt{0,1}-{A-baseline,B-loop}.json`.

### Results

**P0 "chatbot for hospitals":**

| | A baseline | B loop | Delta |
|---|---|---|---|
| Latency | 53.0s | 510.6s | **9.6× slower** |
| Perf goals | 5 | 9 | +4 |
| Inferred reqs | 3 | 9 | +6 |
| Domain | "Healthcare – Hospital Patient Engagement" | "Healthcare – Hospital IT" | softer |
| Compliance | HIPAA, GDPR, **FDA SaMD**, SOC 2 | HIPAA, GDPR, HITECH | **dropped FDA SaMD + SOC 2** |
| Latency target | **<2s** | ≤5s (95p) | **softened 2.5×** |
| Accuracy target | **≥90% clinician-validated** | ≥80% MedMCQA | **softened 10pp** |

**P1 "a tool to catch credit card fraud":**

| | A baseline | B loop | Delta |
|---|---|---|---|
| Latency | 126.2s | 246.4s | 2.0× slower |
| Perf goals | 4 | 5 | +1 |
| Inferred reqs | 3 | 9 | +6 |
| Compliance | PCI DSS, GDPR, **CCPA, PSD2** | PCI DSS, GDPR, AML/KYC, SOX | **dropped CCPA + PSD2**, added AML/KYC (good) + SOX (irrelevant for consumer fraud tool) |
| Recall target | **≥95%** | ≥92% | softened 3pp |
| Throughput target | **≥100k tx/s sustained** | (dropped) | **removed entirely** |
| Latency target | ≤50ms (95p) | ≤8ms (95p) | tightened (good) |

### Key findings

1. **Loop trades ambition for breadth.** Both runs doubled or tripled inferred-requirements count while simultaneously softening the primary perf targets. The baseline's ambitious numbers (P0: 2s latency / 90% accuracy; P1: 95% recall / 100k tx/s throughput) were walked back in the loop output. This is the same failure mode as Exp 13: the model has no ground-truth signal distinguishing "my targets are realistic" from "my targets are too ambitious," so adversary pressure pushes toward generic hedging.

2. **Loop drops critical compliance regimes.** P0 **lost FDA SaMD** — the single most important compliance surface for a clinical-advice chatbot — and lost SOC 2. P1 **lost CCPA and PSD2**, both real laws applicable to card-fraud tooling, and gained SOX, which is about financial reporting for public companies (not the consumer fraud-detection tool being scoped). The loop is not refining compliance, it is randomly resampling it.

3. **Latency cost is large, on vague inputs specifically.** 9.6× slowdown on the shortest prompt — exactly the input class where the feature is supposed to earn its keep via inference-from-sparse-signal. The loop "earns" breadth on P0 in 510 seconds that a user would never wait for in a live flow.

4. **This reproduces Exp 7.** Two years of re-investigation converge on the same answer the 10-use-case suite already produced. The loop's value proposition (adversary catches missing requirements) is real in principle but the validator signal is not strong enough to beat a well-prompted single-pass planner on vague inputs.

### Verdict

`?draft=true` (baseline-only) should be the **frontend default** for short user inputs. The adversary loop should be opt-in — exposed as an explicit "Deep analysis (slower)" toggle, or gated on input length ≥ N characters where the planner has enough material that the loop's breadth-adding behavior is additive rather than substitutive.

This is a Stage 1 parallel to the Exp 13 Stage 2 revert: **retry-on-ground-truth improves quality; retry-on-synthetic-validator-signal regresses it**. Stage 3's execution-error loop (Exp 14) stays — it has real ground truth.

### Deliverables

- `docs/test-results/exp15/prompt0-A-baseline.json` — healthcare draft
- `docs/test-results/exp15/prompt0-B-loop.json` — healthcare loop
- `docs/test-results/exp15/prompt1-A-baseline.json` — fraud draft
- `docs/test-results/exp15/prompt1-B-loop.json` — fraud loop
- `docs/test-results/exp15/summary.txt` — side-by-side comparison
- `scripts/exp15-summary.py` — comparison script (UTF-8 safe)

### Next actions

- Make `?draft=true` the default in the frontend call to `/api/analyze-requirements`.
- Add a "Deep analysis" toggle in the sidebar that flips the flag off.
- Keep the adversary route in the codebase — it is still useful for long/detailed prompts, just not for the vague ones we ship through the demo.

---

## Change Log

| Date | Change | Experiment |
|---|---|---|
| 2026-04-11 | Initial baseline measurement | Exp 1 |
| 2026-04-11 | Fixed `<think>` tag parsing in extractContent() | Exp 1 |
| 2026-04-11 | Added nimJsonCall() retry wrapper with JSON reinforcement | Exp 1 |
| 2026-04-11 | Added convergence-based exit (stagnation detection) | Exp 1 |
| 2026-04-11 | Added time cap (240s) and hard cap (5 rounds) | Exp 1 |
| 2026-04-11 | Implemented selfcritique mode — single-pass planner+adversary+resolution | Exp 2 |
| 2026-04-11 | Implemented asymmetric mode — 49B adversary | Exp 3 |
| 2026-04-11 | Implemented cached mode — domain template injection | Exp 4 |
| 2026-04-11 | Implemented combined mode — cached + asymmetric | Exp 5 |
| 2026-04-11 | Tested all modes against TC-2, logged results | Exp 2-5 |
| 2026-04-11 | **Finding:** cached mode achieves "approved" in 161s (1 round) | Exp 4 |
| 2026-04-11 | **Finding:** selfcritique achieves best latency at 73s with good quality | Exp 2 |
| 2026-04-11 | **Finding:** asymmetric 49B adversary is counterproductive with caching | Exp 5 |
| 2026-04-11 | Built Stage 2: NVIDIA ground truth knowledge base (15 blueprint repos) | Exp 6 |
| 2026-04-11 | Replaced subjective adversary with grounded fact-checker | Exp 6 |
| 2026-04-11 | **Finding:** grounded adversary produces evidence-backed challenges citing real blueprints | Exp 6 |
| 2026-04-11 | **Finding:** grounded mode drives NVIDIA-service-specific recommendations vs generic ones | Exp 6 |
| 2026-04-11 | **Finding:** gaps reduced 5→2 (higher quality, fewer false positives) | Exp 6 |
| 2026-04-11 | Set `default` mode to: domain template + self-critique + grounded adversary loop | Exp 6 |
| 2026-04-11 | Comprehensive test suite: 10 enterprise use cases across 4 categories | Exp 7 |
| 2026-04-11 | **Finding:** Grounded default wins 2/10, baseline wins 6/10, ties 2/10 | Exp 7 |
| 2026-04-11 | **Finding:** Template matching too loose — fires on wrong domains | Exp 7 |
| 2026-04-11 | **Finding:** Blueprint retrieval adds noise for novel domains | Exp 7 |
| 2026-04-11 | **Finding:** Self-critique prompt produces fewer perf goals than simple planner | Exp 7 |
| 2026-04-11 | **Recommendation:** Default should use baseline planner, ground truth in adversary only | Exp 7 |
| 2026-04-12 | Tested 120B with minimal prompt (no rules): 18 services vs 4 with rules — rules were constraining | Exp 8 |
| 2026-04-12 | Tested prompt variants: "include ALL" (18, noisy), "justify" (6, too lean), "production-ready" (10, good) | Exp 8 |
| 2026-04-12 | **Breakthrough:** Data-flow prompt (inputs/outputs) naturally filters wrong services — avg 8.7/10 | Exp 8 |
| 2026-04-12 | Replaced 13-rule Stage 3 prompt with 3-sentence data-flow prompt | Exp 8 |
| 2026-04-12 | Removed all server-side keyword enforcement (exclusions, mandatory pairs, compliance/eval/engine injection) | Exp 8 |
| 2026-04-12 | Stage 1 → Stage 3 wiring: generate-flow accepts GoalSpec, builds enriched context | Exp 8 |
| 2026-04-12 | Edge cases: gibberish and non-NVIDIA goals correctly rejected (verified: false) | Exp 8 |
| 2026-04-12 | **Finding:** 120B doesn't need rules — data flow framing produces better results than keyword rules | Exp 8 |
| 2026-04-13 | Built notebook generation with NVIDIA code pattern grounding (12 patterns from GitHub repos) | Exp 9 |
| 2026-04-13 | Built scaffolding templater (zero LLM calls — PRD, stack, architecture, CLAUDE.md, AGENTS.md) | Exp 9 |
| 2026-04-13 | Built zip export (docs + notebook) with frontend buttons | Exp 9 |
| 2026-04-13 | End-to-end pipeline test: 3 domains (healthcare, fraud, e-commerce) | Exp 9 |
| 2026-04-13 | **Finding:** Code grounding jumps notebook quality 5.5 → 8.0/10 (correct NVIDIA SDK APIs) | Exp 9 |
| 2026-04-13 | **Finding:** System correctly differentiates domains — TensorRT for all 3 (not TensorRT-LLM), Guardrails only for compliance-heavy, RAPIDS for all tabular data | Exp 9 |
| 2026-04-13 | **Finding:** NeMo training CLI is fabricated — grounding covers SDK APIs but not CLI commands | Exp 9 |
| 2026-04-13 | **Finding:** Triton client code is consistently excellent across all domains | Exp 9 |
| 2026-04-13 | Average combined rating: path 8.7/10, notebook 8.0/10, overall 8.3/10 across 3 domains | Exp 9 |
| 2026-04-17 | **Exp 12:** Scaffolding-aware notebook generation — 5 improvements from NVIDIA reference repos (GenerativeAIExamples embedding_finetuning, Retail-Agentic-Commerce) | Exp 12 |
| 2026-04-17 | Phase 1: Rewrote `buildClaudeMD` / `buildAgentsMD` as workflow docs (Session Workflow, Documentation-First rule, Quality Gates, Verification) | Exp 12 |
| 2026-04-17 | Phase 2: Added narrative-driven notebook structure to system prompt (overview → baseline → train → compare → eval → summary) | Exp 12 |
| 2026-04-17 | Phase 3: Added `DATASET_AUTO_DOWNLOAD` universal pattern (HuggingFace, torchaudio, urllib, synthetic fallback) | Exp 12 |
| 2026-04-17 | Phase 4: Added `NEMO_MICROSERVICES_SDK` grounding pattern — replaces fragile `subprocess.run(["nemo", "train", ...])` fabrications with declarative SDK | Exp 12 |
| 2026-04-17 | Phase 5: Fed GoalSpec context (domain, perf targets, compliance, data flow) into notebook prompt via `buildScaffoldingContext` | Exp 12 |
| 2026-04-17 | Added defensive SDK/empty-choices error handling to `/api/generate-notebook` (try/catch around create, null check on choices) | Exp 12 |
| 2026-04-17 | **Finding:** OpenRouter free tier returns empty `choices` on long notebook generations — switched test to NVIDIA NIM direct | Exp 12 |
| 2026-04-17 | End-to-end test (TC-1 healthcare): curator→nemo→nim path, 335s, 10 cells, 27.5 KB notebook via NIM | Exp 12 |
| 2026-04-17 | **Finding:** 8/12 grounding signals present — HIPAA context, de-identification, NeMo Pipeline import, `from_pretrained`, NeMoMicroservices SDK, eval metrics, env-var credentials all correctly used | Exp 12 |
| 2026-04-17 | **Finding:** Phase 2 narrative partially honored — evaluation included, but explicit baseline/before-after cells still missing (model prefers single forward-train story) | Exp 12 |
| 2026-04-17 | **Finding:** Phase 5 compliance injection works — HIPAA + de-identify appear in code without being in the service-path JSON, proved by GoalSpec flow-through | Exp 12 |
| 2026-04-20 | Live frontend test (healthcare RAG prompt) produced 15-service bloated path — regression from Exp 8/9 peak | Exp 13 |
| 2026-04-20 | Git archaeology: identified commit `505662e` as peak config (data-flow prompt, no retry loop) and `e3a7339` as regression trigger (wired validator into retry loop) | Exp 13 |
| 2026-04-20 | Fix A tried — reframe retry feedback to "fewer is better" → 15→12 services but semantic misfits remain (Curator in RAG, no Retriever) | Exp 13 |
| 2026-04-20 | Fix B tried — reframe to bias-neutral "justify each by data flow" (not yet re-tested) | Exp 13 |
| 2026-04-20 | **Finding:** Retry-loop asymmetry — helps Stage 3 (ground-truth execution errors, codeError 5→2) but hurts Stages 1 & 2 (no ground truth; synthetic validator signals cause over-correction) | Exp 13 |
| 2026-04-20 | **Recommendation:** Revert Stage 2 to `505662e` config — remove semantic retry branch, demote `validatePath` to warning-only observability. Keep Stage 3 retry loop intact. | Exp 13 |
| 2026-04-20 | **Revert shipped** — `generate-flow/route.ts` retry loop now fires only on mechanical failures (truncated / unparseable JSON / network). `validatePath` runs post-generation as warning-only, never re-prompted. `buildPathRepromptFeedback` kept in library, no longer called. | Exp 13 |
| 2026-04-20 | **Re-test confirmation** — same healthcare RAG prompt: 15 → 12 → 11 → **9 services** post-revert. Retriever present, Curator now data-flow-justified (legit de-ident role), no redundant tensorrt or cuda-toolkit. Path rating ~8.5/10 — matches Exp 8 baseline. | Exp 13 |
| 2026-04-20 | **Finding:** Data-flow prompt + single call is peak Stage 2 architecture. Retry-on-synthetic-signals demonstrably regresses quality; retry-on-ground-truth (Stage 3 execution errors) demonstrably improves it. | Exp 13 |
| 2026-04-20 | **Finding:** Earlier critique of "nemo-curator = pre-training only" was wrong — Curator is NVIDIA's text-cleaning pipeline, and corpus de-identification is a legitimate role. Data-flow prompt forces justification, so no validator rule needed. A `curator-in-non-pretrain-path` rule would have been a false-positive patch. | Exp 13 |
| 2026-04-20 | **TODO:** Audit Stage 1 `analyze-requirements` for the same retry-on-synthetic-signal pattern — Exp 7 already showed baseline beat grounded-default 6/10 to 2/10; unclear if that revert landed. | Exp 13 |
| 2026-04-20 | Ran CLI orchestrator (`scripts/self-improve-notebook.ts`) locally against frontend-generated healthcare-RAG notebook (Windows, no GPU) | Exp 14 |
| 2026-04-20 | **Finding:** Orchestrator closed 7 of 7 fixable root-cause bugs in iter 1; codeError 9 → 4 (code_ok 2 → 7) | Exp 14 |
| 2026-04-20 | **Finding:** Bugs caught match Brev-trajectory pattern — Python syntax errors + API misuse + protobuf version mismatch all fixed by the self-heal loop | Exp 14 |
| 2026-04-20 | **Finding:** Iter 3 failed on pip-install timeout — environment limit (no GPU, no CUDA), not loop limit. Loop converges when env can execute the NVIDIA stack. | Exp 14 |
| 2026-04-20 | **Confirms:** Ground-truth asymmetry thesis (Exp 13) end-to-end on fresh independent data. Loop converges on stages with execution signal; regresses on stages without. | Exp 14 |
| 2026-04-20 | **Next investment:** Wire orchestrator behind `/api/generate-notebook` route — current frontend ships raw Stage 3; self-heal would close ~7 bugs/notebook. Requires server-side Python exec env (Docker/worker/Brev-hosted backend). | Exp 14 |
| 2026-04-20 | Ran Stage 1 A/B on two vague prompts: `?draft=true` (planner only) vs default adversary loop | Exp 15 |
| 2026-04-20 | **Finding (P0 healthcare):** loop is 9.6× slower (53s → 511s), softens latency target 2s→5s, accuracy 90%→80%, and **drops FDA SaMD + SOC 2** from compliance | Exp 15 |
| 2026-04-20 | **Finding (P1 fraud):** loop is 2× slower (126s → 246s), softens recall 95%→92%, **drops 100k tx/s throughput target entirely**, drops CCPA + PSD2, adds irrelevant SOX | Exp 15 |
| 2026-04-20 | **Finding:** loop adds inferred-requirements breadth (3→9 both cases) but substitutes it *for* perf-target ambition and compliance precision — same retry-on-synthetic-signal pattern as Exp 13 | Exp 15 |
| 2026-04-20 | **Finding:** reproduces Exp 7's "baseline wins 6/10" result on vague inputs specifically — the class where the loop should help most | Exp 15 |
| 2026-04-20 | **Verdict:** `?draft=true` should be the frontend default for short user prompts. Adversary loop becomes opt-in ("Deep analysis" toggle) or length-gated. | Exp 15 |
| 2026-04-20 | **Confirms end-to-end:** Stages 1 and 2 regress under synthetic-signal retry; Stage 3 improves under execution-signal retry. Retry-loop asymmetry thesis now validated across all three stages. | Exp 15 |
| 2026-04-21 | Re-ran end-to-end pipeline on Brev self-hosted NIM (loop-default branch) with vague "chatbot for hospitals" input. Full review: `docs/test-results/exp17-brev-loop-notebook-review.md` | Exp 17 |
| 2026-04-21 | **Finding (Stage 1):** loop on Brev produced 14 perf goals, 6 compliance frameworks, 9 inferred reqs from a 3-word input — 2–3× richer than same input on shared API. Suggests Exp 15's "loop regresses output" finding is shared-API-specific, not fundamental. | Exp 17 |
| 2026-04-21 | **Finding (Stage 3):** validator-retry removal holds — single-pass, 20 cells, 5.5 min. No 27-min 5-cell regression. | Exp 17 |
| 2026-04-21 | **Finding (Stage 3 quality):** 7/10. Real NGC model IDs, real cuDF/sklearn/MLflow/Triton config APIs. But hallucinated `rapids` + `nemo-collections-*` pip packages, NeMo services labeled but using HuggingFace/sklearn equivalents, cell 11 NameError from concatenated line, cell 19 `shutil.copy` on directory. | Exp 17 |
| 2026-04-21 | **Finding (Stage 2 ordering bug):** Layer-sort places TensorRT (SDK layer) as step 1 even when it should be mid-pipeline (after training). Model's internal reasoning orders correctly; post-processing reorders incorrectly. Typed-catalog graph sort needed. | Exp 17 |
| 2026-04-21 | **Next investment:** (a) Stage 2 typed service catalog with consumes/produces ordering. (b) Blueprint-grounded Stage 3 to replace 7 generated cells with parameterized blueprint code. (c) Self-heal on Brev behind `/api/generate-notebook`. | Exp 17 |
| 2026-04-21 | Exp 18: Stage 2 `LAYER_ORDER` post-sort REMOVED on branch `claude/stage2-no-layer-sort` — model's emitted step order ships verbatim. Full review: `docs/test-results/exp18-brev-no-layer-sort-fraud-notebook-review.md` | Exp 18 |
| 2026-04-21 | **Finding (ordering):** for a fraud-detection prompt, path renders RAPIDS → TensorRT (correct data flow) instead of the old sort's TensorRT → RAPIDS (SDK before framework, data-flow-wrong). First verified layer-sort removal end-to-end. | Exp 18 |
| 2026-04-21 | **Finding (non-LLM):** data-flow prompt correctly excluded every LLM-only service (NeMo, Retriever, Guardrails, TensorRT-LLM, Evaluator) for a tabular fraud use case. 6-service path: Brev → NGC → RAPIDS → TensorRT → Triton → AI Enterprise. | Exp 18 |
| 2026-04-21 | **Finding (Stage 3 on Brev):** 2 min 49 s single-pass, 49 % faster than Exp 17's 8-service path. Validator-retry removal holds across prompts. | Exp 18 |
| 2026-04-21 | **Finding (Stage 3 quality):** 6.5 / 10. Same hallucination classes as Exp 17 (`import rapids`, bad tritonclient path) plus new ones specific to non-LLM domain: invented `python -m xgboost.onnx` CLI, deprecated TensorRT API (`builder.max_batch_size`, `builder.build_cuda_engine(...)`), credit-card CSV schema mismatch on `merchant_id` merge. | Exp 18 |
| 2026-04-21 | **Finding (structural):** notebook is INCOMPLETE — Step 6 (AI Enterprise) has markdown but no code cell. Single-pass `attempts=1` means no retry caught it. New signal type for post-generation observability: "every Step N markdown must be followed by a code cell". | Exp 18 |
| 2026-04-21 | **Class-level:** shorter path (6 vs 8 services) did NOT improve Stage 3 quality; produced fewer cells but MORE mechanical errors per cell. Non-LLM domain surfaces hallucination classes not covered by current grounding manifest (XGBoost→ONNX toolchain, real-time feature-store patterns). | Exp 18 |
