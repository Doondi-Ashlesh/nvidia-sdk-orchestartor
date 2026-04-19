/**
 * Sanity check: the notebook route's extractJsonArray must correctly find
 * the cells JSON array when the response also contains PLAN / VALIDATION
 * prose sections with bracket-like characters.
 *
 * We re-implement the key extraction logic inline (the real function is
 * inside the route module, not exported). If the real function changes
 * later, this test gets re-synced.
 */

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function looksLikeCellArray(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  const first = value[0] as Record<string, unknown>;
  return Boolean(first && typeof first === 'object' && 'cell_type' in first);
}

function extractJsonArray(text: string): unknown[] {
  let cleaned = stripThinkTags(text);

  const cellsMarker = cleaned.search(/^#{1,3}\s*CELLS\s*$/m);
  if (cellsMarker !== -1) {
    cleaned = cleaned.slice(cellsMarker);
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
  throw new Error('did not parse');
}

const SAMPLE_RESPONSE = `### PLAN

1. markdown — Overview: describe fraud-detection goal and targets
2. code — Setup: pip install cudf-cu12 cuml-cu12; verify GPU
   Imports: cudf, cuml.ensemble.RandomForestClassifier
   Produces: gdf
3. markdown — Data acquisition
4. code — Load PaySim dataset
   Imports: pandas, numpy
   Produces: df, X, y
5. markdown — Training
6. code — Train RandomForest
   Imports: cuml.ensemble.RandomForestClassifier
   Consumes: X, y
   Produces: model

### VALIDATION

- Step 2: \`cuml.ensemble.RandomForestClassifier\` is in the grounding ✓
- Step 4: standard pandas/numpy, not in NVIDIA grounding but not claimed to be ✓
- Step 6: \`RandomForestClassifier.fit\` — standard sklearn-compatible API ✓
- Variable continuity: X, y from step 4 consumed by step 6 ✓
- No changes needed.

### CELLS
[
  {"cell_type": "markdown", "source": "# Overview\\n\\nFraud detection demo"},
  {"cell_type": "code", "source": "!pip install cudf-cu12\\nimport cudf"},
  {"cell_type": "markdown", "source": "## Training"},
  {"cell_type": "code", "source": "from cuml.ensemble import RandomForestClassifier\\nmodel = RandomForestClassifier()"}
]`;

const cells = extractJsonArray(SAMPLE_RESPONSE);
console.log(`Extracted: ${cells.length} cells`);
for (const c of cells as Array<{ cell_type: string }>) {
  console.log(`  ${c.cell_type}`);
}
console.log(cells.length === 4 ? 'PASS' : 'FAIL');
