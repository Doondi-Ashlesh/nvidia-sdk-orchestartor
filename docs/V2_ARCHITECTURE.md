# SDK Orchestrator — V2 Production Architecture & Build Plan

> **Status:** active build on the `v2` branch. `master` is the frozen V1 visualizer (deployed on Vercel). Nothing merges to `master` until cutover.
>
> **Owner:** Doondi. **Architecture authority:** Lead SA review (this doc).
>
> This document is the single source of truth for what V2 is, why each
> decision was made, and how it gets built inside the budget. If you are
> picking this up cold, read this first.

---

## 1. What V2 is

V1 (on `master`) is a visualizer: it shows NVIDIA's service graph and highlights a path.

V2 turns a vague product goal into a **verified, deployment-ready Jupyter notebook** for the NVIDIA AI stack, built on the NVIDIA stack itself. Four stages plus a harness:

1. **GoalSpec** — vague goal → structured spec with measurable targets
2. **Service path** — spec → ordered NVIDIA service path
3. **Notebook** — path → 30-cell notebook grounded in NVIDIA AI Blueprints
4. **Verification** — notebook executed on real GPU, healed until it runs

---

## 2. The binding constraint: budget

Total compute budget is **free tier + $420 of Brev**. This single constraint drives the entire architecture.

### The decision that makes the budget work

**Generation does NOT run on self-hosted Brev.** Self-hosting Nemotron 120B on 2×H100 NVL is ~$120/day — it burns $420 in ~3.5 days. Instead:

- **Generation → hosted NIM** at build.nvidia.com (free credits). $0 compute.
- **Brev compute → reserved exclusively for ephemeral notebook verification.**

Once generation is off owned compute, $420 is generous, not scarce.

### Budget allocation

| Workload | Where | Cost |
|---|---|---|
| Generation (Nemotron 120B) | Hosted NIM | $0 |
| Embeddings + rerank | Hosted NIM | $0 |
| Guardrails, eval, orchestration | Local / Vercel free | $0 |
| Vector store (Milvus Lite) | Embedded, file-backed | $0 |
| Observability (Phoenix) | Local Docker | $0 |
| App + UI | Vercel free tier | $0 |
| State + memory (Postgres, Redis) | Free tier / local Docker | $0 |
| **Notebook verification (ephemeral GPU)** | **Brev** | **$420** |

### Verification cost model (tiered)

- **Tier-A "does it run"** — A10G (~$1/hr), ~15 min/run = **~$0.25/run**. Catches ~80% of failures.
- **Tier-B "real hardware"** — H100 (~$3.50/hr), ~30 min/run = **~$1.75/run**. Only for GPU-required cells, only on explicit production-validation requests.

Projected total build + demo spend: **~$170 of the $420**, leaving runway.

---

## 3. Target architecture

```
UI (Next.js, Vercel free)
        │
ORCHESTRATION (NeMo Agent Toolkit)
        │
SAFETY (NeMo Guardrails — input + output rails)
        │
GENERATION (Nemotron 120B via hosted NIM, free)
        │
GROUNDING (NeMo Retriever: hosted embed + rerank; Milvus Lite store)
        │
VALIDATION (AST + syntax + narrative — observability only)
        │
VERIFICATION (ephemeral Brev GPU — tiered A10G/H100, $420)
        │
EVAL (NeMo Evaluator + synthetic GoalSpec corpus)
        │
OBSERVABILITY (Phoenix) + STATE (Postgres) + MEMORY (Redis)
```

Every layer except the boxed verification layer is free tier.

---

## 4. Key decisions (and the rationale, so they don't get re-litigated)

| # | Decision | Why |
|---|---|---|
| D1 | Generation on hosted NIM, not self-hosted Brev | Cost. The single change that makes the budget viable. |
| D2 | Brev reserved for ephemeral verification only, scale-to-zero | Cost. No warm GPU, ever. |
| D3 | Tiered verification (A10G default, H100 on demand) | Stretches $420 ~7x vs H100-everything. |
| D4 | Validators stay observability-only | Measured: re-prompting on validator output regressed quality (13-cell → 5-cell stub). Retry only on real execution errors. |
| D5 | NeMo Retriever + Milvus Lite replaces the TS-file matcher | The TS file is not a retrieval system; won't scale, no ranking, no customer-asset ingestion. Milvus Lite is free + embedded. |
| D6 | NeMo Guardrails on input + output | No safety layer = instant fail at enterprise security review. |
| D7 | NeMo Evaluator + synthetic corpus for regression gating | Can't ship a system you can't regression-test. |
| D8 | Deterministic heal loop Tier-1, Claude Code Tier-2 | Caps the external (Anthropic) dependency + cost to hard cases only. |
| D9 | One repo, long-lived `v2` branch, `master` frozen | V2 reuses V1's catalog, prompts, UI shell. New repo would fragment for no benefit. |
| D10 | Cutover by flipping Vercel Production Branch | One-click, reversible. Tag `v1-final` before the permanent `v2 → master` merge. |

### Explicitly deferred (named so scope is clear)

| Deferred | Why | Returns when |
|---|---|---|
| Multi-tenancy | No budget for per-tenant infra | A funding partner needs it |
| Self-hosted NIM | Burns budget | Volume exceeds free credits |
| NemoClaw governance | Enterprise tier, over-engineering now | Regulated-environment customer |
| Dynamo serving | Pays off at multi-instance scale only | Generation volume justifies it |
| Fine-tuning Nemotron | No signal prompting+grounding is saturated | Eval shows grounding ceiling |

---

## 5. Build phases

| Phase | Scope | Cost |
|---|---|---|
| **0 — Foundation** | repo hygiene, docker-compose, CI, `.env.example`, this doc, hosted-NIM as documented default | $0 |
| **1 — Generation on NIM** | port Stage 1–3 to hosted NIM, wrap in NAT, constrained decoding | $0 |
| **2 — Grounding** | NeMo Retriever + Milvus Lite, ingest blueprint catalog, customer-asset path | $0 |
| **3 — Safety + validation** | NeMo Guardrails (Colang rails), validators → Phoenix spans | $0 |
| **4 — Verification** | ephemeral Brev, tiered A10G/H100, budget circuit breaker, audit trail | **$420** |
| **5 — Eval + hardening** | synthetic corpus, NeMo Evaluator in CI, Phoenix dashboards, cost meter | $0 |

---

## 6. Production-ready exit gates

Sign-off requires ALL of:

1. Generation-success rate ≥ 95% on the synthetic eval corpus
2. Verified cell-pass rate ≥ 85% on Tier-A (measured, not claimed)
3. Cost-per-verified-notebook < $2, visible on every request
4. Zero leaked Brev instances across 100 consecutive runs
5. Every prompt change gated by CI eval — no blind merges
6. Clean enterprise security-review checklist (secrets, sandboxing, audit trail, I/O safety)
7. One external person can run the full stack from the repo with no tribal knowledge
8. Total Brev spend for build + demo under $420 with documented headroom

---

## 7. Security posture (the enterprise gate)

| Control | Implementation |
|---|---|
| No secrets in generated code | AST scan on every notebook output + output-guardrail redaction |
| No live customer creds in pipeline | Notebooks use env-var placeholders; creds resolved only in customer runtime |
| Sandboxed execution | Verification on ephemeral, isolated Brev instances; torn down after |
| Audit trail | Every run produces a secrets-scrubbed runbook + heal-report |
| Input safety | Guardrails block PII / injection / off-topic pre-model |
| Output safety | Guardrails redact + enforce compliance markers pre-delivery |
| Reproducibility | AI Workbench `spec.yaml` output for customer-side reproduction |

---

## 8. Risk register

| Risk | Mitigation |
|---|---|
| Free NIM credits exhausted mid-build | Prompt prefix caching; $420 has headroom for a short paid-NIM window |
| Brev instance leak | try/finally teardown + hourly reaper cron + 75% spend alert |
| Verification pass rate too low to be credible | Tiered verification + heal loop; publish an honest target (85%), don't oversell |
| Notebooks depend on unavailable external systems | Mark `REQUIRES EXTERNAL SYSTEM`, validate the stub, never silently fake |
| Single-person bus factor | Phase 0 IaC + CI + this doc; anyone can `docker compose up` + run eval |
