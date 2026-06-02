# SDK Orchestrator — V2 Production Architecture & Build Plan

> **Status:** active build on the `v2` branch. `master` is the frozen V1 visualizer (deployed on Vercel). Nothing merges to `master` until cutover.
>
> **Owner:** Doondi. **Architecture authority:** Lead SA review (this doc).
>
> Read this first. It is the single source of truth for what V2 is, why each
> decision was made, and how it gets built inside the budget.

---

## 1. What V2 is (the one-paragraph version)

A **NeMo Agent Toolkit agent that tailors an NVIDIA AI Blueprint to a user's
use case and verifies it on real GPU — fronted by a visualizer that turns the
result into something a user can actually understand.** The agent is the
engine. The visualizer is the product. A structured *architecture manifest* is
the contract between them: every service node in the graph links to the
notebook cells that implement it and carries a "runs on real GPU" badge.

V1 (on `master`) showed a service graph and guessed a path. V2 shows the
architecture an agent actually **built and verified**, with every node linked
to runnable code.

## 1a. Why this shape (the critique that drove it)

The feedback that reshaped this project: *"why build your own harness instead
of using an existing one?"* It was correct. The earlier design reinvented
orchestration — a bespoke 4-stage pipeline, custom validators-as-orchestration,
a custom heal loop — to do what coding-agent harnesses already do well: read a
reference, tailor it, run it, fix what breaks.

NVIDIA's own blueprints don't do that. AI-Q is an agent given tools + reference
docs. Retail Agentic Commerce is NAT agents given a catalog + tools. The
idiomatic NVIDIA pattern is **agents with good grounding and good tools**, not
bespoke pipelines. V2 adopts that pattern. The harness *is* NeMo Agent Toolkit;
we configure an agent, we don't build a framework.

**What makes V2 impressive is not complexity — it's that it uses the right
tool, grounds on NVIDIA's own blueprints, verifies on real GPU, and teaches the
user through the visualizer. That is a stronger story than the pipeline, and
less to build.**

---

## 2. The binding constraint: budget

Total compute budget is **free tier + $420 of Brev**. This single constraint
drives the architecture.

### The decision that makes the budget work

Generation does **not** run on a continuously-warm self-hosted model
(~$120/day burns $420 in days). Instead:

- **Generation → hosted NIM** (build.nvidia.com, free credits)
- **Brev compute → reserved for ephemeral notebook verification only**
- **Eval → self-hosted scale-to-zero Brev** (only when determinism matters;
  ~$0.85/run, ~$42 for 50 runs)

The long-call timeout that originally drove self-hosting (managed NIM's 15-min
cliff on the monolithic notebook generation) is fixed *architecturally*: the
agent generates **section by section**, so no single call is long. We get free
hosting and robustness from the same change.

### Budget allocation

| Workload | Where | Cost |
|---|---|---|
| Generation (Nemotron 120B), section-decomposed | Hosted NIM | $0 |
| Embeddings + rerank (blueprint selection) | Hosted NIM | $0 |
| Guardrails, eval orchestration, the agent itself | Local / Vercel free | $0 |
| Vector store (Milvus Lite) | Embedded, file-backed | $0 |
| Observability (Phoenix) | Local Docker | $0 |
| App + visualizer | Vercel free tier | $0 |
| State + memory (Postgres, Redis) | Free tier / local Docker | $0 |
| Eval runs (determinism) | Self-hosted scale-to-zero Brev | ~$42 |
| **Notebook verification (ephemeral GPU)** | **Brev (tiered)** | **bulk of $420** |

### Verification cost model (tiered)

- **Tier-A "does it run"** — A10G (~$1/hr), ~15 min = **~$0.25/run**. Catches ~80% of failures.
- **Tier-B "real hardware"** — H100 (~$3.50/hr), ~30 min = **~$1.75/run**. GPU-required cells only, on explicit request.

Projected build + demo spend: **~$170 of $420**, with runway to spare.

---

## 3. Target architecture

```
   USE CASE (user goal)
        │
        ▼
   SELECT — match use case → best NVIDIA blueprint
        NeMo Retriever (hosted embed + rerank) over the blueprint catalog
        │
        ▼
   NAT AGENT — tailor + verify   (the engine — Nemotron-driven, fully NVIDIA)
        grounded on the selected blueprint
        tools:
          - search_corpus         (NeMo Retriever over Milvus Lite)
          - write_notebook        (Nemotron via hosted NIM, section by section)
          - run_on_gpu            (ephemeral Brev; tiered A10G / H100)
          - search_nvidia_skills  (github.com/NVIDIA/skills as grounding)
          - check_compliance      (NeMo Guardrails)
        loop: plan → tailor → execute on GPU → read traceback → fix → repeat
        (Claude Code is a dev-time tool for building this; NOT in the product)
        │
        ├──────────────► NOTEBOOK            (verified on real GPU)
        │
        └──────────────► ARCHITECTURE MANIFEST
                          { services[], connections[], cellRefs,
                            per-service verification }   (types/manifest.ts)
        │
        ▼
   VISUALIZER (React Flow, Next.js)   (the product surface)
        ├─ renders services as nodes, data flow as edges
        ├─ click a node → highlight the notebook cells that implement it
        └─ per-node verification badge (green = runs on real GPU)
```

Three things the user sees: **the graph** (what), **the linked notebook**
(how), **the verification badges** (proof). A complete teaching artifact.

Every layer except the boxed verification step is free tier.

---

## 4. Key decisions (with rationale, so they don't get re-litigated)

| # | Decision | Why |
|---|---|---|
| D1 | NeMo Agent Toolkit is the harness; we configure an agent, not build a pipeline | Answers the "why your own harness" critique; the idiomatic NVIDIA pattern |
| D2 | The visualizer is the product surface, not a vestigial feature | It's the comprehension layer — the only thing that makes the output *teach* rather than just generate |
| D3 | Agent emits an architecture manifest alongside the notebook | The contract that powers click-node→cells linkage and per-node verification badges |
| D4 | Linkage at service granularity for V1; edge granularity is additive later | 90% of the comprehension value for 30% of the work; `implementingCell` field reserved |
| D5 | Generation on hosted NIM, section-decomposed | Free; fixes the 15-min timeout via architecture not hosting; same model quality |
| D6 | Brev reserved for ephemeral verification (tiered A10G/H100), scale-to-zero | Cost. No warm GPU ever. |
| D7 | Eval on self-hosted scale-to-zero Brev | Determinism for reproducible eval; ~$42 affordable |
| D8 | **Retrieval is core, not optional.** NeMo Retriever + Milvus Lite is the grounding backbone over a large heterogeneous corpus (blueprints + NVIDIA docs + skills catalog + code patterns + customer references) | Real use cases ground an agent over a large, growing, customer-extensible corpus — definitionally a retrieval problem. The blueprint *count* was never the variable; the *corpus* is. Deterministic service-overlap survives only as a minor re-ranking signal for blueprint selection. Prior experiments are reference, not drivers. |
| D9 | Real-GPU execution is the verification — not static validators | Ground-truth execution beats static analysis (the validated insight, now expressed through the agent's loop) |
| D10 | Next.js becomes UI/visualizer only; orchestration re-platforms onto NAT (Python) | Makes "built on NeMo Agent Toolkit" true; UI survives, backend logic ports |
| D11 | Strangler migration, not big-bang | Always-shippable; migrate stage by stage; demo progress throughout |
| D12 | One repo, long-lived `v2` branch, `master` frozen; cutover by Vercel branch flip | Reuses V1 catalog/UI; reversible cutover |
| D13 | **The verification agent is a NAT agent driven by Nemotron. Claude Code is a dev-time tool only, not a runtime component of the product.** | The product must be fully NVIDIA-stack to be credible as an NVIDIA reference architecture. Shipping Anthropic's Claude Code in the critical path contradicts the "use the NVIDIA harness, don't bolt on external things" thesis and is the first thing a senior NVIDIA reviewer flags. Claude Code helped *us* build/validate the heal loop; the *product* runs it as a NAT/Nemotron agent. |

### What this rescues from prior work (nothing wasted)

| Prior artifact | Fate |
|---|---|
| Visualizer (React Flow UI) | **Core of V2** — gets better via notebook linkage |
| Service-path / data-flow logic | **Reborn as the architecture manifest** (types/manifest.ts) |
| Blueprint catalog | **The grounding corpus** |
| NVIDIA stack components (NIM, Retriever, Guardrails) | **The agent's tools/config** |
| Real-GPU verification concept | **Feeds per-node verification badges** |
| Custom validators-as-orchestration + bespoke heal loop | **Dropped** — the agent's loop replaces them (the reinvention the feedback flagged) |

### Explicitly deferred (scope clarity)

Multi-tenancy · self-hosted NIM at volume · NemoClaw governance · Dynamo
serving · fine-tuning Nemotron · edge-granularity linkage. Each returns when a
specific trigger (funding partner, volume, regulated customer, measured
ceiling) justifies it.

---

## 5. Build phases (strangler — always shippable)

| Phase | Scope | Cost |
|---|---|---|
| **0 — Foundation** ✅ | repo hygiene, docker-compose, CI, `.env.example`, this doc, manifest schema | $0 |
| **1 — NAT skeleton + selection** | stand up `nat serve`; blueprint selection via NeMo Retriever; emit a manifest from the existing path logic | $0 |
| **2 — Agent tailoring** | the tailor+verify agent; section-decomposed generation; writes notebook + manifest with cellRefs | $0 |
| **3 — Verification tool** | `run_on_gpu` as a NAT tool: ephemeral Brev, tiered, budget circuit breaker, fills verification badges | **Brev** |
| **4 — Visualizer rewire** | Next.js renders the manifest; click-node→cells; verification badges; calls `nat serve` | $0 |
| **5 — Safety + eval + hardening** | NeMo Guardrails as agent tool; `nat eval` + synthetic corpus; Phoenix dashboards; cost meter | $0 |

Strangler detail: the existing TS API routes keep serving until each capability
is live on NAT. The visualizer points at NAT for migrated pieces, TS for the
rest, until cutover.

---

## 6. Production-ready exit gates

Sign-off requires ALL of:

1. Blueprint selection picks the right reference ≥ 90% on the eval set
2. Verified cell-pass rate ≥ 85% on Tier-A (measured, not claimed)
3. Every service node in the manifest links to ≥1 real notebook cell (no orphan nodes)
4. Cost-per-verified-notebook < $2, visible on every request
5. Zero leaked Brev instances across 100 consecutive runs
6. Every agent/prompt change gated by `nat eval` in CI — no blind merges
7. Clean enterprise security-review checklist (secrets, sandboxing, audit trail, I/O safety)
8. One external person can run the full stack from the repo with no tribal knowledge
9. Total Brev spend for build + demo under $420 with documented headroom

---

## 7. Security posture (the enterprise gate)

| Control | Implementation |
|---|---|
| No secrets in generated code | AST scan on notebook output + output-guardrail redaction |
| No live customer creds in pipeline | Notebooks use env-var placeholders; creds resolved only in customer runtime |
| Sandboxed execution | Verification on ephemeral, isolated Brev instances; torn down after |
| Audit trail | Every run produces a secrets-scrubbed runbook + manifest + heal report |
| Input safety | Guardrails block PII / injection / off-topic pre-model |
| Output safety | Guardrails redact + enforce compliance markers pre-delivery |
| Reproducibility | AI Workbench `spec.yaml` output for customer-side reproduction |

---

## 8. Risk register

| Risk | Mitigation |
|---|---|
| Free NIM credits exhausted mid-build | Prompt prefix caching; $420 headroom covers a short paid-NIM window |
| Brev instance leak | try/finally teardown + hourly reaper cron + 75% spend alert |
| Agent wanders / non-deterministic output | NAT Phoenix tracing + `nat eval` gates; bounded turns + budget cap |
| Verification pass rate too low to be credible | Tiered verification + heal loop; publish an honest target (85%) |
| Notebooks depend on unavailable external systems | Mark `REQUIRES EXTERNAL SYSTEM`, validate the stub, never silently fake |
| Manifest/notebook drift (cellRefs point at wrong cells) | Agent tags cells with `service_id` at write time; validated against manifest before render |
| Single-person bus factor | Phase 0 IaC + CI + this doc; anyone can `docker compose up` + run eval |
