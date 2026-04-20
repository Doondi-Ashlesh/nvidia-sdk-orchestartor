/**
 * lib/execution-report.ts
 *
 * Post-process the output of scripts/execute-notebook.py to distinguish
 * ROOT-CAUSE failures from CASCADE failures.
 *
 * WHY: executing a generated notebook typically produces a long list of
 * failures. Feeding all of them to the LLM as "fix these" wastes calls:
 * most are cascades (e.g. "NameError: gdf not defined") triggered by a
 * single earlier root-cause (e.g. "cell 3 pip install failed"). Fix the
 * root, and the cascade resolves itself.
 *
 * Heuristics we use (static — no LLM needed):
 *   - ModuleNotFoundError for module X when an earlier failed cell was a
 *     pip-install block → cascade of the install failure
 *   - NameError for variable V when V is assigned in an earlier failed
 *     cell's source → cascade of that cell's failure
 *   - Otherwise → root cause
 *
 * These heuristics are conservative: a rare genuine root cause might be
 * classified as a cascade. That's acceptable — the worst outcome is that
 * one extra fix-pass runs on the next cycle when the real root is fixed.
 * Over-classifying as root cause would be worse (wasted LLM calls).
 */

// ──────────────────────────────────────────────────────────────────────
// Types matching the Python executor's JSON output
// ──────────────────────────────────────────────────────────────────────

export interface ExecutionCellReport {
  index: number;
  type: 'markdown' | 'code';
  status?: 'ok' | 'error' | 'markdown';
  execution_count?: number | null;
  source_preview?: string;
  error?: {
    name: string;
    message: string;
    traceback: string[];
  };
}

export interface ExecutionReport {
  cells: ExecutionCellReport[];
  summary: {
    total: number;
    markdown: number;
    code: number;
    code_ok: number;
    code_error: number;
  };
}

export type FailureKind = 'root_cause' | 'cascade';

export interface ClassifiedFailure {
  cellIndex: number;
  kind: FailureKind;
  reason: string; // why we classified it this way
  errorName: string;
  errorMessage: string;
  /** For cascades: which earlier cell is the suspected root. */
  cascadeSourceCellIndex?: number;
}

// ──────────────────────────────────────────────────────────────────────
// Helpers to inspect cell source
// ──────────────────────────────────────────────────────────────────────

/** Identifier names assigned at module-level in this source. Rough. */
function namesAssignedIn(source: string): Set<string> {
  const names = new Set<string>();
  if (!source) return names;
  const lines = source.split('\n');
  // `name = expr` — top-level assignment (rough: any line matching `ident =`).
  // `for name in …:`
  // `def name(...)`, `class Name(...)`
  // `import X` / `import X as Y` / `from X import Y, Z as W`
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const assignMatch = line.match(/^([a-zA-Z_]\w*)\s*(?::\s*[^=]+)?=(?!=)/);
    if (assignMatch) {
      names.add(assignMatch[1]);
      continue;
    }
    const forMatch = line.match(/^for\s+([a-zA-Z_]\w*)(?:\s*,\s*[a-zA-Z_]\w*)*\s+in\s/);
    if (forMatch) {
      names.add(forMatch[1]);
      continue;
    }
    const defMatch = line.match(/^(?:def|class)\s+([a-zA-Z_]\w*)/);
    if (defMatch) {
      names.add(defMatch[1]);
      continue;
    }
    const importMatch = line.match(/^import\s+(.+)$/);
    if (importMatch) {
      for (const part of importMatch[1].split(',')) {
        const tok = part.trim().replace(/\s+as\s+(\w+)$/, (_m, a) => a);
        const head = tok.split('.')[0].trim();
        if (head) names.add(head);
      }
      continue;
    }
    const fromMatch = line.match(/^from\s+\S+\s+import\s+(.+)$/);
    if (fromMatch) {
      for (const part of fromMatch[1].replace(/[()]/g, '').split(',')) {
        const tok = part.trim().replace(/\s+as\s+(\w+)$/, (_m, a) => a);
        if (tok) names.add(tok);
      }
    }
  }
  return names;
}

/** Is this cell source likely a `pip install` / package-install block? */
function isInstallCell(source: string): boolean {
  if (!source) return false;
  return (
    /^[\s!%]*pip\s+install\s/m.test(source) ||
    /subprocess\.(?:run|check_call|check_output|Popen|call)\s*\([^)]*\bpip\b/m.test(source) ||
    /subprocess\.(?:run|check_call|check_output|Popen|call)\s*\([^)]*\bconda\b/m.test(source) ||
    /subprocess\.(?:run|check_call|check_output|Popen|call)\s*\([^)]*\bmamba\b/m.test(source) ||
    /python\s+-m\s+pip\s+install/m.test(source)
  );
}

// ──────────────────────────────────────────────────────────────────────
// Classifier
// ──────────────────────────────────────────────────────────────────────

/**
 * Given the executor report plus the ORIGINAL cell sources (from the
 * generated notebook), classify each failed code cell as root-cause or
 * cascade. Returns only the failures (passed cells are omitted).
 *
 * cellSources must be an array parallel to report.cells (by index).
 */
export function classifyFailures(
  report: ExecutionReport,
  cellSources: string[],
): ClassifiedFailure[] {
  const out: ClassifiedFailure[] = [];

  // Track state as we walk forward:
  //   - cells that FAILED earlier (so cascades can reference them)
  //   - names PRODUCED by failed cells (NameError cascade detection)
  //   - failed install cells (ModuleNotFoundError cascade detection)
  const failedIndices: number[] = [];
  const namesFromFailedCells: Map<string, number> = new Map(); // name -> cell idx
  let hadFailedInstall = false;
  let firstFailedInstallIndex: number | null = null;

  for (const cell of report.cells) {
    if (cell.type !== 'code' || cell.status !== 'error' || !cell.error) {
      // mark assignments produced by this SUCCESSFUL cell as available
      continue;
    }

    const idx = cell.index;
    const src = cellSources[idx] ?? '';
    const { name: errName, message: errMsg } = cell.error;

    // Classify —————
    let kind: FailureKind = 'root_cause';
    let reason = 'default: no earlier failure explains this';
    let cascadeFrom: number | undefined = undefined;

    // NameError cascade?
    const nameErrMatch = errName === 'NameError' && errMsg.match(/name '([^']+)' is not defined/);
    if (nameErrMatch) {
      const missingName = nameErrMatch[1];
      if (namesFromFailedCells.has(missingName)) {
        kind = 'cascade';
        cascadeFrom = namesFromFailedCells.get(missingName)!;
        reason = `NameError: '${missingName}' was assigned in failed cell ${cascadeFrom + 1}`;
      }
    }

    // ModuleNotFoundError / ImportError cascade?
    if (
      kind === 'root_cause' &&
      (errName === 'ModuleNotFoundError' || errName === 'ImportError') &&
      hadFailedInstall
    ) {
      kind = 'cascade';
      cascadeFrom = firstFailedInstallIndex!;
      reason = `${errName} likely follows from failed install in cell ${cascadeFrom + 1}`;
    }

    out.push({
      cellIndex: idx,
      kind,
      reason,
      errorName: errName,
      errorMessage: errMsg,
      cascadeSourceCellIndex: cascadeFrom,
    });

    // Record this failed cell's assigned names and install-ness for downstream
    for (const name of namesAssignedIn(src)) {
      if (!namesFromFailedCells.has(name)) namesFromFailedCells.set(name, idx);
    }
    if (isInstallCell(src) && !hadFailedInstall) {
      hadFailedInstall = true;
      firstFailedInstallIndex = idx;
    }
    failedIndices.push(idx);
  }

  return out;
}

/** Ranked list for logging / UI: root causes first, cascades after. */
export function rankForDisplay(failures: ClassifiedFailure[]): ClassifiedFailure[] {
  return [...failures].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'root_cause' ? -1 : 1;
    return a.cellIndex - b.cellIndex;
  });
}

/** Return just the root causes — what the self-improvement loop should fix. */
export function rootCausesOnly(failures: ClassifiedFailure[]): ClassifiedFailure[] {
  return failures.filter((f) => f.kind === 'root_cause');
}
