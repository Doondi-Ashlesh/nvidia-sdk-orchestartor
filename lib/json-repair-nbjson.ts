/**
 * lib/json-repair-nbjson.ts
 *
 * Targeted JSON-repair heuristics for the specific malformation the Nemotron
 * 120B emits under retry pressure: dropped opening quotes on string values
 * that start with a `#` (markdown heading) or other non-JSON-literal char.
 *
 * WHY: observed twice in live runs. Both fixtures show the same pattern:
 *   "source": ## Prerequisites\n- ...
 * instead of:
 *   "source": "## Prerequisites\\n- ..."
 *
 * General-purpose JSON repairers (jsonrepair) fail on this because they
 * expect either a valid JSON token after `:` or a fixable variant they
 * recognise — an unquoted markdown string is neither.
 *
 * Our strategy: regex-find every `"<key>":\s*<non-JSON-start>` pattern,
 * then walk forward until we hit a structural delimiter (`\n  },`,
 * `\n  }\n]`, or the next `"<key>":` at same indent). Re-wrap the
 * substring in quotes with internal quotes / backslashes escaped. Then
 * hand off to JSON.parse; if that still fails, try jsonrepair; if that
 * fails, throw.
 *
 * SCOPE: narrow. This is a band-aid for one specific model failure mode,
 * not a general JSON repairer. If the model invents new malformations
 * we haven't seen, this won't catch them.
 */

import { jsonrepair } from 'jsonrepair';

/**
 * Find-and-repair the unquoted-string-value pattern. Returns the repaired
 * text; if no repair was needed, returns input unchanged.
 *
 * Observed model failure mode: the LLM drops the OPENING quote but keeps
 * the closing one — so the repair is simply to insert `"` at the malformed
 * value-start. Internal escape sequences (\n, \t, \") are already in the
 * correct JSON form because the model writes them as literal two-char
 * escape pairs inside what it thinks is a string.
 */
export function repairUnquotedStringValues(text: string): string {
  // Narrow repair: only target nbformat field keys at their exact JSON
  // indentation (real newline + indentation + `"<known field>":\s*`). This
  // avoids false positives when Python code inside a string value happens
  // to contain `"something":<value>` as part of an f-string format spec.
  //
  // We use REAL newlines (char code 10), not the literal two-char `\n`
  // escape sequences that appear inside string values — so this only
  // matches actual JSON structure, not embedded code.
  const FIELD_PATTERN = /\n[\t ]*"(cell_type|source|outputs|execution_count|metadata|nbformat|nbformat_minor)"\s*:\s*/g;

  const isValidJSONValueStart = (ch: string, i: number): boolean => {
    if (
      ch === '"' || ch === '{' || ch === '[' ||
      ch === '-' || (ch >= '0' && ch <= '9')
    ) {
      return true;
    }
    return (
      text.startsWith('true', i) ||
      text.startsWith('false', i) ||
      text.startsWith('null', i)
    );
  };

  const insertions: number[] = [];
  let m: RegExpExecArray | null;
  FIELD_PATTERN.lastIndex = 0;
  while ((m = FIELD_PATTERN.exec(text)) !== null) {
    const valueStart = m.index + m[0].length;
    if (valueStart >= text.length) continue;
    if (!isValidJSONValueStart(text[valueStart], valueStart)) {
      insertions.push(valueStart);
    }
  }

  if (insertions.length === 0) return text;

  let out = '';
  let cursor = 0;
  for (const pos of insertions) {
    out += text.slice(cursor, pos) + '"';
    cursor = pos;
  }
  out += text.slice(cursor);
  return out;
}

/**
 * Try JSON.parse; on failure, apply our targeted repair; if that still fails,
 * fall back to the generic jsonrepair library. Throws a descriptive error if
 * no strategy produces valid JSON.
 */
export function parseLenientJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {}

  try {
    return JSON.parse(repairUnquotedStringValues(text));
  } catch {}

  try {
    return JSON.parse(jsonrepair(text));
  } catch (e3) {
    throw new Error(
      `Failed to parse JSON (all strategies): ${e3 instanceof Error ? e3.message : String(e3)}`,
    );
  }
}

/**
 * Last-resort extractor: walk an array-of-objects JSON blob and pull out
 * each top-level object that can be parsed independently. Returns the list
 * of successfully-parsed objects plus a count of objects we couldn't parse.
 *
 * WHY: when the full notebook JSON can't be parsed as a whole (because one
 * malformed cell poisons the top-level array), we'd rather return N good
 * cells and log "skipped M malformed" than fail the whole request.
 *
 * The caller can decide how many cells is enough — e.g. if fewer than half
 * of expected cells parse, treat as failure.
 */
export function extractParseableObjects(text: string): {
  objects: unknown[];
  malformedCount: number;
} {
  // Try the whole thing first — if it works, we have a complete parse.
  try {
    const whole = parseLenientJson(text);
    if (Array.isArray(whole)) return { objects: whole, malformedCount: 0 };
  } catch {}

  // Apply whole-text repair first so individual chunks benefit from the
  // unquoted-string fixes. If repair improves anything we'll walk the
  // repaired version; otherwise walk the original.
  let walkText = text;
  try {
    walkText = repairUnquotedStringValues(text);
  } catch {}

  // Walk character-by-character. Track top-level bracket depth. Each time
  // we hit a complete `{...}` at depth 1 (inside the outer array), try to
  // parse just that chunk. If parse succeeds, add to results; if not, skip
  // and increment malformed count. Continue until end.
  const objects: unknown[] = [];
  let malformedCount = 0;
  let depth = 0;
  let inString = false;
  let escape = false;
  let objStart = -1;

  for (let i = 0; i < walkText.length; i++) {
    const ch = walkText[i];
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

    if (ch === '{') {
      depth++;
      if (depth === 1) objStart = i;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart !== -1) {
        const chunk = walkText.slice(objStart, i + 1);
        try {
          const parsed = parseLenientJson(chunk);
          objects.push(parsed);
        } catch {
          malformedCount++;
        }
        objStart = -1;
      }
    }
  }

  return { objects, malformedCount };
}
