import { readFileSync } from 'node:fs';
import {
  classifyFailures,
  rankForDisplay,
  rootCausesOnly,
  type ExecutionReport,
} from '../lib/execution-report';

const nbPath = 'C:/Users/THUNDER/Downloads/nvidia-pipeline-ai-1776632037968.ipynb';
const reportPath = 'C:/tmp/exec-report-clean.json';

const nb = JSON.parse(readFileSync(nbPath, 'utf8')) as {
  cells: Array<{ cell_type: string; source: string | string[] }>;
};
const cellSources = nb.cells.map((c) =>
  Array.isArray(c.source) ? c.source.join('') : (c.source as string),
);

const report = JSON.parse(readFileSync(reportPath, 'utf8')) as ExecutionReport;

console.log(`Summary: ${JSON.stringify(report.summary)}\n`);

const failures = classifyFailures(report, cellSources);
const ranked = rankForDisplay(failures);

console.log(`=== Classified ${failures.length} failures ===\n`);
for (const f of ranked) {
  const tag = f.kind === 'root_cause' ? '🔴 ROOT' : '  cascade';
  console.log(`${tag}  cell ${f.cellIndex + 1}: ${f.errorName}: ${f.errorMessage.slice(0, 80)}`);
  console.log(`         reason: ${f.reason}`);
}

const roots = rootCausesOnly(failures);
console.log(`\n=== Self-improvement loop would fix only ${roots.length} cells (vs ${failures.length} total failures) ===`);
for (const f of roots) {
  console.log(`  cell ${f.cellIndex + 1}: ${f.errorName}: ${f.errorMessage.slice(0, 100)}`);
}
