# 08 — Notebook Heal (Claude Code agent + Brev CLI)

> Run a Claude Code session locally. The agent provisions a Brev GPU instance via `brev` CLI, scp's the generated notebook over, executes it with papermill, reads real tracebacks, edits failing cells, re-runs, and tears the instance down — all in one session. The agent owns the lifecycle. There is no orchestrator script.

## When to use this

- You have a generated `.ipynb` and want it to be deployment-ready, not just plausible-looking
- You want execution-grounded fixes, not static guesses
- You're comfortable with ~$2–10 per run (Anthropic API + Brev GPU time)

## When **not** to use this

- The notebook depends on real customer systems (real Epic, real Salesforce, real customer DBs) — the agent can't validate against systems it has no credentials for
- You need a deterministic check (use `scripts/deploy-and-validate.ts` instead — no agent, repeatable)
- You're A/B-testing prompt changes — agent nondeterminism makes it a bad measurement instrument

## One-time setup

```bash
# 1. Install Claude Code
npm install -g @anthropic-ai/claude-code

# 2. Install the heal skill (autoloads when you ask Claude to heal a notebook)
mkdir -p ~/.claude/skills
cp -r assets/skills/notebook-heal ~/.claude/skills/

# 3. Optional but recommended: install the NVIDIA Agent Skills catalog as
#    grounding for NVIDIA-specific APIs
git clone --depth=1 https://github.com/NVIDIA/skills.git /tmp/nv-skills
mv /tmp/nv-skills/skills ~/.claude/skills/nvidia
rm -rf /tmp/nv-skills

# 4. Make sure brev CLI is installed and authenticated
brev --version || curl -fsSL https://raw.githubusercontent.com/brevdev/brev-cli/main/bin/install-latest.sh | bash
brev login

# 5. Anthropic API key — needed by Claude Code
export ANTHROPIC_API_KEY=sk-ant-…
```

## Running a heal session

One command:

```bash
claude --max-turns 50 \
  "Heal /absolute/path/to/notebook.ipynb so every cell that can run, runs end-to-end on a real GPU.
   Use the notebook-heal skill. Use the NVIDIA agent skills under ~/.claude/skills/nvidia/ for
   canonical NVIDIA APIs. Provision a Brev instance, do the work, and tear it down when done."
```

The agent will:
1. `brev create heal-… --gpu A10G --detached` (or H100 if it judges the workload needs it)
2. Poll `brev ls` until ready, then `brev refresh`
3. ssh in, install papermill + nbclient + ipykernel
4. scp the notebook over
5. Execute with papermill, read per-cell errors
6. Fix cells locally, scp back, re-execute
7. Loop until done or budget exhausted
8. scp the healed notebook back to `<input>.healed.ipynb`
9. Write `<input>.heal-report.json` with the structured outcome
10. `brev delete` the instance

## Outputs

Three files next to the input notebook:

| File | What it is |
|---|---|
| `<name>.healed.ipynb` | The agent's final notebook |
| `<name>.heal-report.json` | Structured report — initial vs final cell counts, fixes applied, skills consulted, instance + duration, turns used |
| `<name>.run.log` | Final papermill output from the Brev box |

Plus the agent's own transcript, which Claude Code logs to `~/.claude/projects/...` by default.

## Reading the heal report

```json
{
  "instance": { "name": "heal-1761...", "gpu": "A10G", "duration_seconds": 423 },
  "initial":  { "code_cells": 11, "passing": 2,  "failing": 9 },
  "final":    { "code_cells": 11, "passing": 9,  "failing": 0,
                "external_required": 1, "unresolved": 1 },
  "fixes_applied": [
    { "cell_index": 3, "class": "hallucinated-api",
      "summary": "replaced subprocess.check_call(stdin=string) with the canonical pip install pattern" }
  ],
  "skills_consulted": ["nvidia/Model-Optimizer/ptq", "nvidia/TensorRT-LLM"],
  "turns_used": 18
}
```

`external_required` and `unresolved` are not failures of the agent — they're honest reporting. Cells that depend on a customer endpoint can't be validated from a fresh Brev box. Cells the agent gave up on after 3 attempts get flagged so you can investigate.

## Cost & time bounds

| What | Typical | Worst case |
|---|---|---|
| Wall clock | 10–25 min | ~45 min (hits `--max-turns`) |
| Brev GPU | $1–4 (A10G) / $5–15 (H100) | Bounded by wall clock |
| Anthropic API | $1–5 | Bounded by `--max-turns` |
| **Total per run** | **$2–10** | **$20+ on H100 with a hard notebook** |

Lower `--max-turns` to ~20 for routine validation; reserve 50+ for "must ship" runs.

## Phase 1 — prove the agent on your laptop *before* spending Brev money

Recommended before your first paid Brev run:

```bash
# Same command, but tell the agent to run locally — no brev provisioning.
# Catches Python errors, hallucinated APIs, syntax issues. Won't catch
# CUDA/driver/network — that's what the real Brev run is for.
claude --max-turns 30 \
  "Heal ./out/exp14-input.ipynb to run end-to-end ON THIS MACHINE (no Brev — execute with
   local papermill). Use the notebook-heal skill. Skip cells that need a GPU; mark them
   '# REQUIRES GPU — not validated locally'."
```

If this round produces a meaningful improvement (e.g. 2/11 → 6/11 on cells that don't need a GPU), the agent loop works. If it doesn't, fix the SKILL.md before paying for Brev time.

## Security notes

- `ANTHROPIC_API_KEY` is read from your local environment by Claude Code. The agent itself never sees the key.
- The agent has `Bash` + `Write` permissions locally. It can install packages and run arbitrary commands on your laptop. Run heal sessions in a dedicated workspace, not your main project repo.
- Brev instances always have a real network connection. The agent will pip-install packages and pull model weights from HuggingFace / NGC. Don't run heal on notebooks containing real customer data.
- Bring up a *fresh* instance per run (the agent does this by default). The skill explicitly forbids reusing a long-lived instance across runs.

## Troubleshooting

### Agent never provisions an instance
Skill didn't load. Check: `ls ~/.claude/skills/notebook-heal/SKILL.md`. If missing, redo the one-time setup.

### Agent provisions but never deletes the instance
Verify with `brev ls`. The skill's hard rule is "always tear down" — if it didn't, capture the transcript and tighten the SKILL.md hard rules. Also: manually `brev delete <name>` to stop billing.

### Agent gets stuck on one cell forever
Either `--max-turns` is too tight or that specific cell's failure is genuinely outside the agent's tooling. Pull the transcript, see what the agent tried, decide whether to extend the SKILL.md or accept the cell as `# UNRESOLVED`.

### The healed notebook is *worse* than the input
Skill rule violation. The skill says "preserve intent — don't refactor, don't switch SDKs, don't delete cells you don't understand." If the agent did any of those things, tighten that section of the SKILL.md.

## Related

- `assets/skills/notebook-heal/SKILL.md` — the agent's full task spec
- `scripts/deploy-and-validate.ts` — the deterministic no-agent path (cheap sanity check; the agent is the upgrade)
- `scripts/archive/execute-notebook.py` — the local nbclient executor (used by both the script above and by the agent in laptop mode)
- `scripts/archive/self-improve-notebook.ts` — the older single-cell-fix loop. **Do not extend this; it's superseded by the agent flow.**

## What this replaces

The previous heal architecture was an orchestrator script that wrapped a Claude Code session running on the Brev box. It worked but it was four files: SKILL.md, bootstrap shell script, TS orchestrator, doc. The agent + brev CLI version is one file (the SKILL.md) plus this doc. Less code, less to maintain, and it matches the original feedback: "use the CLI with agents."
