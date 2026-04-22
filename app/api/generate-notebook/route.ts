/**
 * POST /api/generate-notebook
 *
 * Generates a production-ready Jupyter notebook from a service path.
 * Uses real NVIDIA code patterns as grounding to prevent hallucinated APIs.
 *
 * WHY this file changed (Day 1 of production hardening):
 *   - LLM calls now go through lib/llm-client (provider-agnostic, replay-aware)
 *   - Request + response validated with zod schemas (lib/schemas.ts)
 *   - User-provided `goal` sanitised and wrapped in <user_goal> delimiters
 *   - System prompt carries INJECTION_GUARD
 *   - Every response carries a provenance header cell
 *
 * Procedures: docs/procedures/01-llm-route.md
 *             docs/procedures/02-validator.md
 */

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import type { WorkflowStep, GoalSpec } from '@/types/ecosystem';
import { getRelevantPatterns } from '@/lib/notebook-patterns';
import { buildNotebookJson, toSourceLines } from '@/lib/workflow-notebook';
import type { NotebookCell } from '@/lib/workflow-notebook';
import {
  buildPRD,
  buildArchitecture,
  buildFeatureSpecs,
} from '@/lib/scaffolding-templates';
import { completeChat } from '@/lib/llm-client';
// Re-prompt builders (buildASTRepromptFeedback, buildNarrativeRepromptFeedback,
// buildPythonSyntaxRepromptFeedback) are intentionally NOT imported —
// their retry loops regressed output (see Exp 13 / Exp 15 / dry-run
// 2026-04-21 where 13 cells collapsed to 5 after three retries). The
// builders still live in the validator modules for potential future use
// with a ground-truth-grounded signal.
import {
  validateNotebookAST,
  type NotebookCellLike,
} from '@/lib/validators/notebook-ast';
import { validateNarrative } from '@/lib/validators/narrative';
import { validatePythonSyntax } from '@/lib/validators/python-syntax';
import { extractParseableObjects } from '@/lib/json-repair-nbjson';
import {
  GenerateNotebookRequestSchema,
  NotebookCellsSchema,
  sanitizeUserText,
  wrapUserBlock,
  INJECTION_GUARD,
  zodErrorsToStrings,
} from '@/lib/schemas';

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/** Check if parsed value looks like notebook cells (array with cell_type). */
function looksLikeCellArray(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  const first = value[0] as Record<string, unknown>;
  return Boolean(first && typeof first === 'object' && 'cell_type' in first);
}

/**
 * Extract a JSON array from a possibly-fenced LLM response. Tolerant of
 * <think> tags, code fences, and trailing prose.
 */
function extractJsonArray(text: string): unknown[] {
  let cleaned = stripThinkTags(text);

  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  const trimmed = cleaned.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (looksLikeCellArray(parsed)) return parsed as unknown[];
    } catch {
      /* fall through */
    }
  }

  let searchFrom = 0;
  while (searchFrom < cleaned.length) {
    const start = cleaned.indexOf('[', searchFrom);
    if (start === -1) break;

    let depth = 0;
    let inString = false;
    let escape = false;
    let end = -1;
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === '[') depth++;
      if (ch === ']') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }

    if (end !== -1) {
      try {
        const parsed = JSON.parse(cleaned.slice(start, end + 1));
        if (looksLikeCellArray(parsed)) return parsed as unknown[];
      } catch {
        /* try next [ */
      }
      searchFrom = start + 1;
    } else {
      break;
    }
  }

  // Last resort: the LLM emitted malformed JSON (typically dropped opening
  // quotes on string values under retry pressure). Try partial extraction —
  // we'd rather ship 15 of 16 cells than return a 502.
  const partial = extractParseableObjects(text);
  const goodCells = partial.objects.filter(
    (o) =>
      o !== null &&
      typeof o === 'object' &&
      'cell_type' in (o as Record<string, unknown>),
  );
  if (goodCells.length >= 3) {
    console.warn(
      `[generate-notebook] partial extraction: recovered ${goodCells.length} cells, skipped ${partial.malformedCount} malformed`,
    );
    return goodCells as unknown[];
  }

  throw new Error(
    `No valid JSON cell array found in response (length=${text.length}, partial-extract got ${goodCells.length} cells).`,
  );
}

// ── Scaffolding context builder ─────────────────────────────────────────────
// Feeds the full scaffolding stack (PRD, per-feature specs, architecture) into
// the notebook prompt. Previously only a minimal hand-rolled summary + the
// data-flow diagram were passed; this meant the generator lacked:
//   - numeric performance targets and compliance rationale (PRD)
//   - per-step spec telling each cell what its inputs, outputs, and role are
//     (feature specs)
// so it had to re-derive those from the raw steps JSON.
//
// Token cost: ~11KB (~2.8K tokens) for a typical 9-step path. Model's
// response budget is 32K max_tokens; context window is far larger. This is a
// trivial addition for a large quality lift.
//
// We deliberately EXCLUDE buildClaudeMD and buildAgentsMD from this prompt —
// those are instructions for a different agent (Claude Code using the
// notebook later) and including them confuses the notebook generator about
// its own role.

function buildScaffoldingContext(
  goalSpec: GoalSpec,
  steps: WorkflowStep[],
): string {
  const parts: string[] = [];

  // PRD — enriched goal + measurable targets + compliance + inferred reqs.
  parts.push('=== PROJECT REQUIREMENTS (implement this) ===');
  parts.push(buildPRD(goalSpec));
  parts.push('');

  // Architecture — data flow diagram. Keeps the model aligned on what each
  // step produces and consumes.
  parts.push('=== ARCHITECTURE ===');
  parts.push(buildArchitecture(steps));
  parts.push('');

  // Per-feature specs. Each becomes a concrete contract for one code cell:
  // role, action, inputs, outputs. This is the single highest-leverage
  // addition — the notebook cell for step N should implement feature N's
  // contract, not improvise.
  parts.push('=== PER-STEP SPECIFICATIONS ===');
  parts.push(
    'Each step below is a contract for one section of the notebook. The cell(s) for that step must honour the declared inputs/outputs and produce the described behaviour. Do not skip or rearrange steps.',
  );
  parts.push('');
  const features = buildFeatureSpecs(steps);
  for (const f of features) {
    parts.push(f.content);
    parts.push('');
  }

  return parts.join('\n');
}

// ── Provenance header ───────────────────────────────────────────────────────

function buildProvenanceCell(opts: {
  goal: string;
  providerLabel: string;
  modelTag: string;
  latencyMs: number;
  attempts: number;
  correlationId: string;
}): NotebookCell {
  const lines = [
    '<!-- Generated by NVIDIA Ecosystem Pipeline. Do not edit this cell. -->',
    '',
    `**Goal:** ${opts.goal.slice(0, 200)}${opts.goal.length > 200 ? '…' : ''}`,
    '',
    '| Field | Value |',
    '|---|---|',
    `| Model | \`${opts.modelTag}\` |`,
    `| Provider | \`${opts.providerLabel}\` |`,
    `| Generated | ${new Date().toISOString()} |`,
    `| Latency | ${opts.latencyMs} ms |`,
    `| Attempts | ${opts.attempts} |`,
    `| Correlation ID | \`${opts.correlationId}\` |`,
  ];
  return {
    cell_type: 'markdown',
    metadata: {},
    source: toSourceLines(lines.join('\n')),
  };
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  const t0 = Date.now();

  // 0. Blueprint feature flag. Default is ON for this branch
  // (`claude/blueprint-grounding`) so UI runs use the blueprint path
  // automatically. `?useBlueprints=false` opts OUT when you want to
  // compare against the pre-blueprint from-scratch generation.
  const url = new URL(request.url);
  const useBlueprints = url.searchParams.get('useBlueprints') !== 'false';

  // 1. Parse + validate request body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON' },
      { status: 400 },
    );
  }

  const parsed = GenerateNotebookRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid request',
        issues: zodErrorsToStrings(parsed.error),
      },
      { status: 400 },
    );
  }
  const { goal: rawGoal, steps, goalSpec } = parsed.data;

  // 2. Sanitize user-provided strings
  const safeGoal = sanitizeUserText(rawGoal);

  // 2a. Blueprint grounding (NOT blueprint verbatim-return).
  //
  // If a matching NVIDIA blueprint exists for this GoalSpec + path, we
  // load its full cell content and inject it into the Stage 3 system
  // prompt as *reference material*. The LLM then generates a CUSTOMIZED
  // notebook that uses the blueprint's real APIs, helpers, and section
  // structure — but tailored to the user's specific goal (compliance,
  // dataset, integration targets, perf targets, sample queries, etc.).
  //
  // An earlier iteration on this branch returned the blueprint verbatim
  // with only a goal-header cell prepended. That was technically correct
  // but defeated the purpose — user got NVIDIA's generic demo with a
  // sticker, not a customized plan. This design keeps the blueprint as
  // grounding, makes the LLM do the customization work.
  let blueprintReference: string | null = null;
  let matchedBlueprintId: string | null = null;
  let matchedBlueprintTitle: string | null = null;
  let blueprintGroundingMeta: { cellCount: number; sizeChars: number } | null = null;

  if (useBlueprints && goalSpec) {
    try {
      const { matchBlueprint } = await import('@/lib/blueprint-matcher');
      const { loadBlueprintContent } = await import('@/lib/blueprint-grounding');
      const matchResult = matchBlueprint(goalSpec, steps);

      console.log(
        `[generate-notebook][${correlationId}] blueprint match: ${matchResult.reason} ` +
        `scores=${JSON.stringify(matchResult.scores)}`,
      );

      if (matchResult.blueprint) {
        const grounding = loadBlueprintContent(matchResult.blueprint);
        blueprintReference = grounding.referenceText;
        matchedBlueprintId = matchResult.blueprint.id;
        matchedBlueprintTitle = matchResult.blueprint.title;
        blueprintGroundingMeta = { cellCount: grounding.cellCount, sizeChars: grounding.sizeChars };

        console.log(
          `[generate-notebook][${correlationId}] grounding with ${matchResult.blueprint.id}: ` +
          `${grounding.cellCount} cells, ${grounding.sizeChars} chars`,
        );
      }
    } catch (err) {
      // Grounding load failed (missing .ipynb, parse error, etc.).
      // Fall through to plain from-scratch generation; don't 500 the request.
      console.warn(
        `[generate-notebook][${correlationId}] blueprint grounding failed, falling through: ` +
        (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  // 3. Assemble prompts
  const serviceIds = steps.map((s) => s.serviceId);
  const patterns = getRelevantPatterns(serviceIds);
  const scaffoldingContext = goalSpec
    ? buildScaffoldingContext(goalSpec, steps)
    : '';

  // Blueprint reference section — only included when a blueprint matched
  // AND we successfully loaded its .ipynb. The prompt explicitly tells
  // the model this is grounding material, not the final output.
  const blueprintGroundingSection = blueprintReference && matchedBlueprintTitle
    ? `
## REFERENCE BLUEPRINT — "${matchedBlueprintTitle}" (use as grounding, NOT as final output)

You have been given NVIDIA's canonical "${matchedBlueprintTitle}" blueprint below. Its helpers, API calls, deploy patterns, env var names, and section structure are KNOWN-CORRECT — use them verbatim. But the blueprint is a GENERIC demo. Your job is to produce a CUSTOMIZED notebook specifically for the user's goal, using the blueprint as the architectural reference.

**What to preserve from the blueprint (verbatim):**
- Helper function names and signatures: \`docker_compose\`, \`check_containers\`, \`api_get\`, \`check_health\`, \`deploy_all\`, \`stop_all\`, \`await chat\`, \`await list_collections\`, \`await upload_documents\`, \`RailsConfig.from_path\`, etc. Do NOT invent variants or substitute with HuggingFace / sklearn / custom Python.
- Section structure: Setup → Prerequisites → Deploy → Test → (Customize) → Cleanup. Keep this skeleton.
- Env var names and port numbers: \`APP_NVINGEST_*\`, \`RAG_SERVER_PORT=8081\`, \`INGESTOR_SERVER_PORT=8082\`, \`MILVUS_ENDPOINT\`, etc. The blueprint uses these specific names — the deployed services listen on these specific ports.
- Config-file names the blueprint references (\`prompt.yaml\`, \`config.yml\`, \`nims.yaml\`, \`docker-compose-*.yaml\`).
- Docker compose deploy pattern (the \`deploy_all()\` calling 4 compose files, not hand-rolled \`docker run\`).

**What to CUSTOMIZE for the user's goal (DO NOT ship the blueprint's defaults):**
- **Sample queries / test questions**: the blueprint likely uses generic questions like "What is machine learning?". REPLACE with 2-3 questions drawn from the user's domain and use case.
- **Sample dataset / document corpus**: the blueprint likely downloads a public sample (e.g. a Wikipedia PDF). REPLACE with a goal-appropriate corpus. If no public equivalent exists, write a clearly-marked placeholder cell (e.g. \`HOSPITAL_CORPUS_PATH = "./data/deidentified_clinical_notes/"  # TODO: populate with your de-identified source\`) with an inline comment describing expected format.
- **Guardrails / safety config**: generate a Colang rails file (\`rails.co\` + \`config.yml\`) specifically enforcing the user's compliance frameworks. HIPAA → PHI redaction + refuse out-of-scope clinical advice + confidence-based escalation. SOX → audit logging + decision-explanation retention. PCI DSS → tokenize PAN before logging. Do NOT use the blueprint's default (usually empty/permissive) rails.
- **Performance / scaling env vars**: set based on the user's stated latency / throughput targets (e.g. \`MAX_TOKENS=512\` for sub-1.5s latency; \`DYNAMIC_BATCH_SIZE=32\` for 20k TPS).
- **Integration-stub cells**: for every external system the user mentioned (Epic EHR, Kafka stream, OPC-UA to MES, chargeback workflow, etc.), add a clearly-marked stub cell showing the connection point, expected message shape, and auth pattern — even if it's a TODO.
- **Evaluation cell tailored to the user's targets**: not a generic benchmark — a cell that tests against the specific perf goals from the GoalSpec (e.g. "assert p95_latency_ms <= 1500" for a latency-sensitive use case, "assert recall >= 0.95 on safety_critical_intents" for clinical safety).
- **Domain-specific sections** the blueprint doesn't have: clinical-safety evaluation for healthcare; 7-year audit retention for SOX; failover / hot-swap procedure if the user asked for zero-downtime; etc.

**Hard rules:**
- DO NOT output a verbatim copy of the blueprint with a goal-header prepended. The user has already seen that; it's worthless to them.
- DO NOT invent API calls not in the blueprint or the grounding patterns above. Use what's real.
- DO customize at minimum: the sample question(s), the sample dataset, the guardrails config, and add at least one integration stub cell per external system mentioned.

### Reference blueprint content (${blueprintGroundingMeta?.cellCount ?? 0} cells, ${blueprintGroundingMeta?.sizeChars ?? 0} chars):

\`\`\`
${blueprintReference}
\`\`\`

---
`
    : '';

  const systemPrompt = `You are a senior NVIDIA AI engineer generating production-ready Jupyter notebooks.

═══════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT — READ THIS FIRST
═══════════════════════════════════════════════════════════════════════════
Your ENTIRE response MUST be a single JSON array of cell objects. Nothing
else. No prose. No markdown. No <think> tags. No "Here is the notebook:"
preamble. No commentary after the array. Just the array:

[{"cell_type": "markdown", "source": "..."}, {"cell_type": "code", "source": "..."}]

TARGET OUTPUT SIZE: 30–60 cells. Too few = incomplete coverage. Too many
= bloated. Aim for the minimum that covers setup, deploy, test, customize,
and cleanup for the user's goal.

If you find yourself writing anything outside the JSON array — STOP and
put it inside a markdown cell's \`source\` field, or delete it entirely.
═══════════════════════════════════════════════════════════════════════════

CRITICAL: Use the REAL NVIDIA CODE PATTERNS below. Do NOT invent API calls or function names.

${patterns}
${blueprintGroundingSection}
NOTEBOOK STRUCTURE (narrative-driven, matches NVIDIA GenerativeAIExamples pattern):
The notebook should tell a story, not just list services. Follow this sequence:

  1. Overview cell (markdown): the goal, expected outcome, and metrics to improve
  2. Prerequisites cell (markdown): hardware, credentials, dependencies
  3. Setup cell (code): pip installs + env var checks
  4. Baseline demo (if applicable): deploy existing model, run a sample query, show the baseline weakness
  5. For each service in the path, one markdown + one code cell implementing that step
  6. Before/after comparison (if training/fine-tuning is involved): same query on improved model, show measurable difference
  7. Evaluation cell: run a standardized benchmark, display the metrics
  8. Summary markdown: what was accomplished, next steps, optional cleanup

Rules:
- Use environment variables for credentials (os.environ["NVIDIA_API_KEY"])
- Include a pip install cell up front with all required packages
- Each code cell must be self-contained with proper imports
- Use the exact API patterns from the grounding above — do NOT invent CLIs like \`nemo train\` that don't exist
- When training/fine-tuning is in the path, use a REAL public dataset (HuggingFace, LibriSpeech, MovieLens, etc.) via auto-download — do not assume data exists locally
- Prefer pretrained models via \`.from_pretrained()\` over loading local checkpoints
- Source must be a single string (not an array)
- Do NOT write \`subprocess.run(["nemo", "train", ...])\` — NeMo has no such CLI. Use the Python SDK or NeMoMicroservices SDK.

${INJECTION_GUARD}

═══════════════════════════════════════════════════════════════════════════
FINAL REMINDER BEFORE OUTPUT
═══════════════════════════════════════════════════════════════════════════
Respond with ONLY a JSON array. Start with [ and end with ]. Each element
is an object with exactly two fields: "cell_type" (either "markdown" or
"code") and "source" (string). Example shape:

[{"cell_type": "markdown", "source": "# Title\\n\\nExplanation..."}, {"cell_type": "code", "source": "import os\\n..."}]

Do not include anything before the opening [ or after the closing ].
═══════════════════════════════════════════════════════════════════════════`;

  const baseUserPrompt = scaffoldingContext
    ? `GOAL:\n${wrapUserBlock(safeGoal)}\n\n${scaffoldingContext}\n\nSERVICE PATH (JSON):\n${JSON.stringify(steps, null, 2)}`
    : `GOAL:\n${wrapUserBlock(safeGoal)}\n\nSERVICE PATH:\n${JSON.stringify(steps, null, 2)}`;

  // 4. Call model with parse+schema re-prompt loop (up to 3 attempts)
  let cells: unknown[] | null = null;
  let feedback = '';
  let lastChat:
    | Awaited<ReturnType<typeof completeChat>>
    | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    // Cap feedback size — observed live: accumulating validator feedback on
    // retries destabilises Nemotron's JSON emission (it starts writing prose-
    // shaped output and drops opening quotes on string values).
    const clippedFeedback = feedback.length > 1500 ? feedback.slice(0, 1500) + '\n…' : feedback;
    const userPrompt =
      attempt === 1
        ? baseUserPrompt
        : baseUserPrompt +
          '\n\nYour previous response had these issues — fix them:\n' +
          clippedFeedback +
          '\n\nRESPOND WITH ONLY A JSON ARRAY. No <think> tags. Start with [';

    try {
      lastChat = await completeChat({
        stage: 'notebook',
        fixtureName: `goal-${correlationId.slice(0, 8)}`,
        fixtureInput: { goal: safeGoal, steps, goalSpec },
        correlationId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0,
        top_p: 0.95,
        max_tokens: 32768,
        maxAttempts: 1, // llm-client's retries are for network; we handle parse here
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[generate-notebook][${correlationId}] chat failed attempt ${attempt}: ${msg}`,
      );
      feedback = `previous attempt errored: ${msg}`;
      if (attempt >= 3) {
        return NextResponse.json(
          { error: 'LLM provider failure', detail: msg, correlationId },
          { status: 502 },
        );
      }
      continue;
    }

    // Stream truncation: give the model another shot with the same prompt.
    if (lastChat.finishReason === 'length' && attempt < 3) {
      feedback = 'response was truncated; keep the JSON array shorter';
      continue;
    }

    let extracted: unknown[];
    try {
      extracted = extractJsonArray(lastChat.content);
    } catch (err) {
      feedback = `could not parse a JSON array from your response. ${err instanceof Error ? err.message : err}`;
      if (attempt >= 3) {
        return NextResponse.json(
          {
            error: 'Failed to parse notebook cells from LLM response',
            correlationId,
          },
          { status: 502 },
        );
      }
      continue;
    }

    // Schema validation (layer 1 — structure).
    const schemaResult = NotebookCellsSchema.safeParse(extracted);
    if (!schemaResult.success) {
      const issues = zodErrorsToStrings(schemaResult.error);
      feedback = `schema violations: ${issues.join('; ')}`;
      if (attempt >= 3) {
        return NextResponse.json(
          {
            error: 'Notebook cells failed schema validation',
            issues,
            correlationId,
          },
          { status: 502 },
        );
      }
      continue;
    }

    // Validators run as observability only — their output is logged and
    // surfaced in the response but NEVER fed back to the model as retry
    // feedback. Exp 13 (Stage 2) and Exp 15 (Stage 1) both proved that
    // re-prompting on synthetic validator signals regresses output: the
    // model reads "here are violations" as pressure to restructure, and
    // the restructured output is usually worse than the first call. On a
    // local dry run (2026-04-21) the previous in-route retry loop turned
    // a 13-cell first-pass into a 5-cell stub after three iterations and
    // ran for 27 minutes. Retry is only the right tool when the signal
    // is ground truth — i.e. real execution errors — and that loop lives
    // OUTSIDE this route (Exp 14 orchestrator, `/api/fix-notebook-cell`).

    // Layer 2: AST grounding — catches invented imports / fake CLIs.
    const astResult = validateNotebookAST(
      schemaResult.data as NotebookCellLike[],
    );
    console.log(
      `[generate-notebook][${correlationId}] AST: ` +
        `cells=${astResult.stats.codeCellsChecked} imports=${astResult.stats.importsChecked} ` +
        `nvidia=${astResult.stats.nvidiaImportsChecked} violations=${astResult.violations.length}`,
    );
    if (!astResult.ok) {
      console.warn(
        `[generate-notebook][${correlationId}] AST violations (${astResult.violations.length}) — surfaced but NOT re-prompted:`,
      );
      for (const v of astResult.violations.slice(0, 5)) {
        console.warn(`  - ${v.message}`);
      }
    }

    // Layer 3: Python syntax — catches parse errors via local `ast.parse`.
    const syntaxResult = validatePythonSyntax(
      schemaResult.data as NotebookCellLike[],
    );
    console.log(
      `[generate-notebook][${correlationId}] python-syntax: ` +
        `cells=${syntaxResult.stats.codeCellsChecked} ` +
        `skipped=${syntaxResult.skipped} ` +
        `violations=${syntaxResult.violations.length}`,
    );
    if (!syntaxResult.ok) {
      console.warn(
        `[generate-notebook][${correlationId}] Python syntax errors (${syntaxResult.violations.length}) — surfaced but NOT re-prompted:`,
      );
      for (const v of syntaxResult.violations.slice(0, 5)) {
        console.warn(`  - ${v.message}`);
      }
    }

    // Layer 4: Narrative structure — checks required sections exist.
    const narrativeResult = validateNarrative(
      schemaResult.data as NotebookCellLike[],
      steps,
    );
    console.log(
      `[generate-notebook][${correlationId}] narrative: ` +
        `found=[${narrativeResult.sectionsFound.join(',')}] ` +
        `missing=${narrativeResult.violations.length}`,
    );
    if (!narrativeResult.ok) {
      console.warn(
        `[generate-notebook][${correlationId}] Narrative gaps: ` +
          `missing=${narrativeResult.violations.map((v) => v.section).join(',')} — surfaced but NOT re-prompted`,
      );
    }

    cells = schemaResult.data;
    break;
  }

  if (!cells || !lastChat) {
    return NextResponse.json(
      { error: 'Failed to generate notebook', correlationId },
      { status: 500 },
    );
  }

  // 5. Build notebook — prepend provenance header cell
  const dataCells: NotebookCell[] = cells.map((raw) => {
    const cell = raw as { cell_type?: string; source?: string | string[] };
    const srcRaw = cell.source ?? '';
    const src = typeof srcRaw === 'string' ? srcRaw : srcRaw.join('');

    if (cell.cell_type === 'code') {
      return {
        cell_type: 'code',
        metadata: {},
        execution_count: null,
        outputs: [],
        source: toSourceLines(src),
      };
    }
    return {
      cell_type: 'markdown',
      metadata: {},
      source: toSourceLines(src),
    };
  });

  const provenance = buildProvenanceCell({
    goal: safeGoal,
    providerLabel: lastChat.providerLabel,
    modelTag: lastChat.modelTag,
    latencyMs: Date.now() - t0,
    attempts: lastChat.attempts,
    correlationId,
  });

  const notebook = buildNotebookJson([provenance, ...dataCells]);
  const body = JSON.stringify(notebook, null, 2);
  const latencyMs = Date.now() - t0;

  console.log(
    `[generate-notebook][${correlationId}] OK cells=${dataCells.length} ` +
      `provider=${lastChat.providerLabel} model=${lastChat.modelTag} ` +
      `ms=${latencyMs} tokens=${lastChat.usage?.total_tokens ?? '?'}`,
  );

  // Diagnostic header noting whether a blueprint was used for grounding.
  // `blueprint-grounded:<id>` means the LLM had the blueprint as reference
  // material in its system prompt (and should have customized around it).
  // `from-scratch` means no blueprint matched or grounding load failed.
  const generationMode = matchedBlueprintId
    ? `blueprint-grounded:${matchedBlueprintId}`
    : 'from-scratch';

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="nvidia-pipeline.ipynb"`,
      'X-Latency-Ms': String(latencyMs),
      'X-Cell-Count': String(dataCells.length + 1),
      'X-Correlation-Id': correlationId,
      'X-Model-Tag': lastChat.modelTag,
      'X-Generation-Mode': generationMode,
      ...(blueprintGroundingMeta
        ? {
            'X-Blueprint-Reference-Cells': String(blueprintGroundingMeta.cellCount),
            'X-Blueprint-Reference-Chars': String(blueprintGroundingMeta.sizeChars),
          }
        : {}),
    },
  });
}
