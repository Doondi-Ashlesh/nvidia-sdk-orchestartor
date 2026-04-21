import { readFileSync } from 'node:fs';
import { repairUnquotedStringValues } from '../lib/json-repair-nbjson';

const broken = JSON.parse(readFileSync('fixtures/notebook/goal-db2608d2.json', 'utf8')).content as string;
const repaired = repairUnquotedStringValues(broken);

console.log(`Length before: ${broken.length}, after: ${repaired.length}, delta: ${repaired.length - broken.length}`);

try {
  JSON.parse(repaired);
  console.log('\n✓ Parses successfully');
} catch (e) {
  const msg = (e as Error).message;
  console.log(`\n✗ Parse fails: ${msg.slice(0, 150)}`);
  const m = msg.match(/position (\d+)/);
  if (m) {
    const pos = parseInt(m[1]);
    console.log(`Position ${pos} context:`);
    console.log(JSON.stringify(repaired.slice(Math.max(0, pos - 60), pos + 80)));
  }
}

// Also print what the raw snippet looked like before vs after at pos 960
console.log('\n--- position 940-1100 ---');
console.log('BEFORE:', JSON.stringify(broken.slice(940, 1100)));
console.log('');
console.log('AFTER :', JSON.stringify(repaired.slice(940, 1100)));
