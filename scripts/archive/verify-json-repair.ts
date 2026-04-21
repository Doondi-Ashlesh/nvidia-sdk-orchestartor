/**
 * Verify json-repair-nbjson against the actual broken fixture from today's run.
 */
import { readFileSync } from 'node:fs';
import { parseLenientJson } from '../lib/json-repair-nbjson';

const raw = readFileSync('fixtures/notebook/goal-db2608d2.json', 'utf8');
const fixture = JSON.parse(raw) as { content: string };
const broken = fixture.content;

console.log(`Input: ${broken.length} chars`);
console.log(`First 60: ${JSON.stringify(broken.slice(0, 60))}`);

try {
  JSON.parse(broken);
  console.log('Unexpectedly parsed without repair (bug in test fixture?)');
  process.exit(1);
} catch (e) {
  console.log(`Vanilla JSON.parse fails as expected: ${(e as Error).message.slice(0, 80)}`);
}

try {
  const parsed = parseLenientJson(broken) as Array<{ cell_type: string; source: string }>;
  console.log(`\n✓ Repaired + parsed. Cells: ${parsed.length}`);
  console.log(`Cell types: ${parsed.map((c) => c.cell_type).join(', ')}`);
  const allStrings = parsed.every((c) => typeof c.source === 'string');
  console.log(`All sources are strings: ${allStrings}`);
  // Show a sample of the repaired `source` that was previously broken
  for (const cell of parsed) {
    if (typeof cell.source === 'string' && cell.source.startsWith('## Prereq')) {
      console.log(`\nRepaired Prerequisites cell (first 200 chars):`);
      console.log(cell.source.slice(0, 200));
      break;
    }
  }
  process.exit(0);
} catch (e) {
  console.log(`\n✗ Repair failed: ${(e as Error).message}`);
  process.exit(1);
}
