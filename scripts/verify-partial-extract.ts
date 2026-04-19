import { readFileSync } from 'node:fs';
import { extractParseableObjects } from '../lib/json-repair-nbjson';

const broken = JSON.parse(readFileSync('fixtures/notebook/goal-db2608d2.json', 'utf8')).content as string;

const { objects, malformedCount } = extractParseableObjects(broken);

console.log(`Extracted: ${objects.length} objects`);
console.log(`Malformed skipped: ${malformedCount}`);
if (objects.length > 0) {
  const first = objects[0] as { cell_type?: string; source?: string };
  console.log(`\nFirst object cell_type: ${first.cell_type}`);
  for (let i = 0; i < Math.min(objects.length, 10); i++) {
    const o = objects[i] as { cell_type?: string; source?: string };
    const src = String(o.source ?? '').slice(0, 80).replace(/\n/g, ' ');
    console.log(`  [${i + 1}] ${o.cell_type ?? '?'}: ${src}...`);
  }
}
