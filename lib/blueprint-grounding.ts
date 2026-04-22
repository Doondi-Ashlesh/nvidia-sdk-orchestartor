/**
 * Blueprint grounding loader.
 *
 * Loads a blueprint .ipynb from disk and formats its cells into a single
 * string suitable for injection into the Stage 3 LLM system prompt as
 * *reference material*. The output is NOT the final notebook — it's the
 * example the model studies while producing its own customized output.
 *
 * Why this shape (plain text with cell-type separators rather than raw
 * JSON):
 *   - Plain text with explicit cell markers is easier for Nemotron to
 *     parse and reason about than raw Jupyter JSON (which has
 *     nbformat/metadata/outputs noise).
 *   - The model only needs the *content* of cells (source), not the
 *     execution_count / outputs / cell ids — stripping those keeps the
 *     prompt tight.
 *   - Cell index + type in the header lets the model reference cells
 *     when it reasons about structure ("I'll follow the pattern of
 *     cells 3-5 but customize for the user's domain").
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { BlueprintRecord } from '@/lib/blueprints';

export interface BlueprintGroundingContent {
  /** Formatted reference text ready to inline into a system prompt. */
  referenceText: string;
  /** How many cells in the source blueprint. */
  cellCount: number;
  /** Size of the formatted reference text, in characters. */
  sizeChars: number;
}

interface NotebookCellRaw {
  cell_type: 'markdown' | 'code' | 'raw';
  source: string | string[];
}

interface NotebookRaw {
  cells: NotebookCellRaw[];
}

/**
 * Load the blueprint's .ipynb and return its cells formatted as a
 * reference string. Throws if the file is missing or malformed.
 *
 * The formatted output uses per-cell headers:
 *
 *   --- [cell 0] markdown ---
 *   # Title
 *
 *   --- [cell 1] markdown ---
 *   ## Section 1
 *
 *   --- [cell 2] code ---
 *   import foo
 *   ...
 *
 * This is compact, parseable by the model's reasoning, and preserves
 * the blueprint's sequence so "follow the section structure" actually
 * means something.
 */
export function loadBlueprintContent(
  blueprint: BlueprintRecord,
): BlueprintGroundingContent {
  const absPath = join(process.cwd(), blueprint.ipynbPath);
  if (!existsSync(absPath)) {
    throw new Error(
      `Blueprint file missing: ${absPath}. ` +
      `See data/blueprints/README.md for how to populate it from ${blueprint.source.repo}.`,
    );
  }

  const raw = readFileSync(absPath, 'utf8');
  let parsed: NotebookRaw;
  try {
    parsed = JSON.parse(raw) as NotebookRaw;
  } catch (err) {
    throw new Error(
      `Blueprint at ${absPath} is not valid JSON: ` +
      (err instanceof Error ? err.message : String(err)),
    );
  }

  if (!Array.isArray(parsed.cells)) {
    throw new Error(
      `Blueprint at ${absPath} is not a valid Jupyter notebook (missing cells array).`,
    );
  }

  const sections = parsed.cells.map((cell, idx) => {
    const src = Array.isArray(cell.source) ? cell.source.join('') : (cell.source ?? '');
    return `--- [cell ${idx}] ${cell.cell_type} ---\n${src}`;
  });

  const referenceText = sections.join('\n\n');

  return {
    referenceText,
    cellCount: parsed.cells.length,
    sizeChars: referenceText.length,
  };
}
