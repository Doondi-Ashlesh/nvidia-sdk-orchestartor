import { readFileSync } from 'node:fs';
import {
  buildPRD,
  buildStack,
  buildArchitecture,
  buildFeatureSpecs,
} from '../lib/scaffolding-templates';
import type { GoalSpec } from '../types/ecosystem';

const spec = JSON.parse(JSON.parse(readFileSync('fixtures/goalspec/planner-c1e35bfd.json', 'utf8')).content) as GoalSpec;
// Defensive — fixture may predate latest schema normalization.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const s = spec as any;
s.inferred_requirements ??= [];
s.gaps ??= [];
s.conflicts ??= [];
s.constraints ??= { compliance: [], hardware: '', scale: '', other: [] };

const steps = JSON.parse(JSON.parse(readFileSync('fixtures/path/flow-4decb6f7.json', 'utf8')).content).steps;

const prd = buildPRD(spec);
const stack = buildStack(spec, steps);
const arch = buildArchitecture(steps);
const features = buildFeatureSpecs(steps);

console.log('Sizes:');
console.log(`  PRD:          ${prd.length} chars`);
console.log(`  Stack:        ${stack.length} chars`);
console.log(`  Architecture: ${arch.length} chars`);
console.log(`  Features:     ${features.length} files, ${features.reduce((s, f) => s + f.content.length, 0)} chars total`);
console.log(`  TOTAL:        ${prd.length + stack.length + arch.length + features.reduce((s, f) => s + f.content.length, 0)} chars`);

console.log('\n--- PRD (first 800 chars) ---');
console.log(prd.slice(0, 800));

console.log('\n--- first feature spec ---');
if (features[0]) {
  console.log(`name: ${features[0].name}`);
  console.log(features[0].content);
}
