/**
 * Blueprint parameterizer — load a blueprint .ipynb from disk, perform
 * token substitution on its cell sources from the incoming GoalSpec,
 * and return the ready-to-ship notebook object.
 *
 * Substitution uses literal `{{SLOT_NAME}}` tokens in the blueprint's
 * cell source strings. Each slot is resolved via the `SlotResolver`
 * functions registered in `lib/blueprints.ts` under
 * `parameterizableSlots`. Unresolved slots are left as-is (literal
 * `{{SLOT}}`) so missing-slot bugs are visible in the output — better
 * than silent substitution with empty strings.
 *
 * What this is NOT:
 *   - It is NOT running the notebook. Execution happens elsewhere
 *     (either the user's Jupyter, or later, the self-heal orchestrator
 *     behind /api/generate-notebook).
 *   - It is NOT modifying the blueprint's CODE logic. Substitutions
 *     only touch the `{{SLOT}}` placeholders. Structural / library
 *     differences between the blueprint's assumed shape and the user's
 *     goal are not reconciled here — that's what self-heal (Phase 2)
 *     closes on.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { BlueprintRecord, BlueprintSlot } from '@/lib/blueprints';
import type { GoalSpec, WorkflowStep } from '@/types/ecosystem';

// ── Types ───────────────────────────────────────────────────────────────────

/** Minimal notebook shape — matches Jupyter's nbformat 4.x. */
interface NotebookCell {
  cell_type: 'markdown' | 'code' | 'raw';
  source: string | string[];
  metadata?: Record<string, unknown>;
  outputs?: unknown[];
  execution_count?: number | null;
  [key: string]: unknown;
}

interface Notebook {
  cells: NotebookCell[];
  metadata: Record<string, unknown>;
  nbformat: number;
  nbformat_minor: number;
  [key: string]: unknown;
}

export interface ParameterizeResult {
  notebook: Notebook;
  /** Which slots were filled and with what values — for logging/diagnostics. */
  resolvedSlots: Partial<Record<BlueprintSlot, string>>;
  /** Slots that appeared in the template but couldn't be resolved. */
  unresolvedSlots: BlueprintSlot[];
  /** How many substitution replacements were performed across all cells. */
  substitutionCount: number;
}

// ── Loading ─────────────────────────────────────────────────────────────────

/** Load the blueprint's .ipynb from disk. Throws if the file is missing. */
function loadBlueprintNotebook(blueprint: BlueprintRecord): Notebook {
  const absPath = join(process.cwd(), blueprint.ipynbPath);
  if (!existsSync(absPath)) {
    throw new Error(
      `Blueprint file missing: ${absPath}. See data/blueprints/README.md ` +
      `for how to download the real .ipynb from ${blueprint.source.repo}.`,
    );
  }

  const raw = readFileSync(absPath, 'utf8');
  const parsed = JSON.parse(raw) as Notebook;

  if (!Array.isArray(parsed.cells)) {
    throw new Error(
      `Blueprint at ${absPath} is not a valid Jupyter notebook (missing cells array).`,
    );
  }

  return parsed;
}

// ── Substitution ────────────────────────────────────────────────────────────

/** Normalize a cell.source into a single string for easier manipulation. */
function cellSourceToString(source: string | string[]): string {
  return Array.isArray(source) ? source.join('') : source;
}

/**
 * Replace every `{{SLOT_NAME}}` in `text` where SLOT_NAME is in
 * `substitutions`. Returns the new text and the count of replacements.
 */
function substituteSlots(
  text: string,
  substitutions: Partial<Record<BlueprintSlot, string>>,
): { text: string; count: number } {
  let count = 0;
  const out = text.replace(/\{\{([A-Z_]+)\}\}/g, (match, name) => {
    const slot = name as BlueprintSlot;
    if (slot in substitutions) {
      const value = substitutions[slot];
      if (value !== undefined && value !== '') {
        count += 1;
        return value;
      }
    }
    // Leave unresolved tokens in place — visible in output for debugging.
    return match;
  });
  return { text: out, count };
}

// ── Main entry ──────────────────────────────────────────────────────────────

/**
 * Produce a parameterized notebook for this blueprint + user goal.
 * Returns the notebook plus diagnostics on which slots were resolved.
 */
export function parameterizeBlueprint(
  blueprint: BlueprintRecord,
  goalSpec: GoalSpec,
  steps: WorkflowStep[],
): ParameterizeResult {
  const notebook = loadBlueprintNotebook(blueprint);

  // 1. Resolve each slot via the registered resolver fn.
  const resolvedSlots: Partial<Record<BlueprintSlot, string>> = {};
  for (const [slotName, resolver] of Object.entries(blueprint.parameterizableSlots)) {
    const value = resolver(goalSpec, steps);
    if (value !== '') {
      resolvedSlots[slotName as BlueprintSlot] = value;
    }
  }

  // 2. Walk every cell, substitute tokens in source.
  let substitutionCount = 0;
  const newCells: NotebookCell[] = notebook.cells.map((cell) => {
    const originalText = cellSourceToString(cell.source);
    const { text, count } = substituteSlots(originalText, resolvedSlots);
    substitutionCount += count;
    return {
      ...cell,
      // Keep source as a single string. Jupyter accepts either form.
      source: text,
    };
  });

  // 3. Compute which slots appeared in the template but weren't resolved.
  const allTokens = new Set<BlueprintSlot>();
  for (const cell of notebook.cells) {
    const src = cellSourceToString(cell.source);
    const matches = src.matchAll(/\{\{([A-Z_]+)\}\}/g);
    for (const m of matches) {
      allTokens.add(m[1] as BlueprintSlot);
    }
  }
  const unresolvedSlots = Array.from(allTokens).filter(
    (tok) => !(tok in resolvedSlots),
  );

  return {
    notebook: {
      ...notebook,
      cells: newCells,
    },
    resolvedSlots,
    unresolvedSlots,
    substitutionCount,
  };
}
