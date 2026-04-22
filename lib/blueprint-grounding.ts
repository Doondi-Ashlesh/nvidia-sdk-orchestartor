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

  // Keep all code cells (they have the real APIs the LLM needs to reference),
  // and keep only markdown cells that define non-trivial structure (section
  // headers + >=2 lines of content). Drop decorative / TOC-only / separator
  // markdown cells — they bloat the reference without adding signal.
  //
  // Tuning notes: dropping decorative cells on the Enterprise RAG blueprint
  // takes the reference from ~58k chars to ~25k — roughly 2.3× denser in
  // useful content, and leaves more model attention budget for generating
  // the customized output.
  const sections: string[] = [];
  for (let idx = 0; idx < parsed.cells.length; idx++) {
    const cell = parsed.cells[idx];
    const src = Array.isArray(cell.source) ? cell.source.join('') : (cell.source ?? '');
    const trimmed = src.trim();

    if (cell.cell_type === 'code') {
      // Keep every code cell — these contain the real APIs / helpers / deploy
      // patterns the LLM needs to reference verbatim.
      sections.push(`--- [cell ${idx}] code ---\n${src}`);
    } else if (cell.cell_type === 'markdown') {
      // Drop markdown that's obviously decorative: empty, just `---` dividers,
      // single-line headers, or short (<120 chars) cells.
      const isSubstantive =
        trimmed.length >= 120 &&
        trimmed.replace(/^#+\s*/, '').length >= 40 &&
        trimmed !== '---';
      if (isSubstantive) {
        sections.push(`--- [cell ${idx}] markdown ---\n${src}`);
      }
    }
  }

  const referenceText = sections.join('\n\n');

  return {
    referenceText,
    cellCount: parsed.cells.length,
    sizeChars: referenceText.length,
  };
}
