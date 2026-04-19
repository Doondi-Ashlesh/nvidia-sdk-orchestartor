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
import {
  validateNotebookAST,
  buildASTRepromptFeedback,
  type NotebookCellLike,
} from '@/lib/validators/notebook-ast';
import {
  validateNarrative,
  buildNarrativeRepromptFeedback,
} from '@/lib/validators/narrative';
import {
  validatePythonSyntax,
  buildPythonSyntaxRepromptFeedback,
} from '@/lib/validators/python-syntax';
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

  // Plan/Validate/Emit format: the model emits "### PLAN\n...\n### VALIDATION\n
  // ...\n### CELLS\n[...]". Slice to just the CELLS section so our scanner
  // doesn't trip over bracket-like tokens in the plan or validation prose.
  const cellsMarker = cleaned.search(/^#{1,3}\s*CELLS\s*$/m);
  if (cellsMarker !== -1) {
    cleaned = cleaned.slice(cellsMarker);
    // Drop the "### CELLS" header line itself.
    cleaned = cleaned.replace(/^#{1,3}\s*CELLS\s*\n?/, '');
  }

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

  // 3. Assemble prompts
  const serviceIds = steps.map((s) => s.serviceId);
  const patterns = getRelevantPatterns(serviceIds);
  const scaffoldingContext = goalSpec
    ? buildScaffoldingContext(goalSpec, steps)
    : '';

  const systemPrompt = `You are a senior NVIDIA AI engineer generating production-ready Jupyter notebooks.

CRITICAL: Use the REAL NVIDIA CODE PATTERNS below. Do NOT invent API calls or function names.

${patterns}

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

═══════════════════════════════════════════════════════════════════════
OUTPUT FORMAT — THREE SECTIONS IN ONE RESPONSE
═══════════════════════════════════════════════════════════════════════

You MUST produce your output in three sections, in this exact order:

### PLAN
List every cell you will write. For each cell, include:
  - Index (1-based)
  - Type (markdown | code)
  - One-line purpose
  - For code cells only: the exact imports you will use and the key API calls
    (e.g. "tritonclient.http.InferenceServerClient(url=...)", not "triton client")
  - For code cells only: variables produced and variables consumed from prior cells

### VALIDATION
Cross-check every API call in the PLAN against the REAL NVIDIA CODE PATTERNS
above. For each code cell in the plan, answer:
  - Are ALL imports and attribute accesses listed in the grounding patterns?
  - If any are NOT in the grounding, either remove them or replace with a
    grounded alternative. Explicitly list each change you made.
  - Cross-cell variable references: every variable a cell consumes must be
    produced by an earlier cell in the plan. Flag and fix mismatches.

### CELLS
The final JSON array of cells. Start this section with a line containing
exactly "### CELLS" on its own line, then a newline, then the opening
bracket of the JSON array.

FORMAT OF THE CELLS ARRAY (must match exactly):
[{"cell_type": "markdown", "source": "# Title\\n\\nExplanation..."}, {"cell_type": "code", "source": "import os\\n..."}]

IMPORTANT: the PLAN and VALIDATION sections exist to force you to commit to
correct API choices BEFORE writing code. Do not skip them. Do not write
placeholder plans. A rigorous plan produces a notebook that runs; a lazy
plan produces one that doesn't.`;

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

    // AST grounding validation (layer 2 — semantic). Checks that every
    // import / attribute chain under an NVIDIA namespace exists in the
    // allowed-API manifest. Fake CLI invocations (e.g. `nemo train`) are
    // also caught here.
    const astResult = validateNotebookAST(
      schemaResult.data as NotebookCellLike[],
    );
    console.log(
      `[generate-notebook][${correlationId}] Attempt ${attempt} AST: ` +
        `cells=${astResult.stats.codeCellsChecked} imports=${astResult.stats.importsChecked} ` +
        `nvidia=${astResult.stats.nvidiaImportsChecked} violations=${astResult.violations.length}`,
    );

    if (!astResult.ok && attempt < 3) {
      feedback = buildASTRepromptFeedback(astResult);
      continue;
    }

    // Final attempt: accept the notebook even with residual AST violations
    // but surface them in logs so post-run inspection can catch what survived.
    if (!astResult.ok) {
      console.warn(
        `[generate-notebook][${correlationId}] AST violations survived retries (${astResult.violations.length}):`,
      );
      for (const v of astResult.violations.slice(0, 5)) {
        console.warn(`  - ${v.message}`);
      }
    }

    // Python syntax check (layer 3 — won't parse). Calls `ast.parse` via a
    // local Python subprocess. Catches missing `:` on block starters,
    // unclosed brackets, etc. Runtime-only bugs (wrong args, uncallable
    // context manager) still require execution — that's Brev's job.
    const syntaxResult = validatePythonSyntax(
      schemaResult.data as NotebookCellLike[],
    );
    console.log(
      `[generate-notebook][${correlationId}] Attempt ${attempt} python-syntax: ` +
        `cells=${syntaxResult.stats.codeCellsChecked} ` +
        `skipped=${syntaxResult.skipped} ` +
        `violations=${syntaxResult.violations.length}`,
    );

    if (!syntaxResult.ok && attempt < 3) {
      feedback = buildPythonSyntaxRepromptFeedback(syntaxResult);
      continue;
    }

    if (!syntaxResult.ok) {
      console.warn(
        `[generate-notebook][${correlationId}] Python syntax errors survived retries (${syntaxResult.violations.length}):`,
      );
      for (const v of syntaxResult.violations.slice(0, 5)) {
        console.warn(`  - ${v.message}`);
      }
    }

    // Narrative structure validation (layer 4 — shape of the story).
    // Checks that required sections (overview / setup / baseline / eval /
    // summary) are present. Training paths require baseline too.
    const narrativeResult = validateNarrative(
      schemaResult.data as NotebookCellLike[],
      steps,
    );
    console.log(
      `[generate-notebook][${correlationId}] Attempt ${attempt} narrative: ` +
        `found=[${narrativeResult.sectionsFound.join(',')}] ` +
        `missing=${narrativeResult.violations.length}`,
    );

    if (!narrativeResult.ok && attempt < 3) {
      feedback = buildNarrativeRepromptFeedback(narrativeResult);
      continue;
    }

    if (!narrativeResult.ok) {
      console.warn(
        `[generate-notebook][${correlationId}] Narrative gaps survived retries: ` +
          `missing=${narrativeResult.violations.map((v) => v.section).join(',')}`,
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

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="nvidia-pipeline.ipynb"`,
      'X-Latency-Ms': String(latencyMs),
      'X-Cell-Count': String(dataCells.length + 1),
      'X-Correlation-Id': correlationId,
      'X-Model-Tag': lastChat.modelTag,
    },
  });
}
