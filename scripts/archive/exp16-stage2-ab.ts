/**
 * Exp 16: Does the Stage 1 adversary loop's richer GoalSpec cause Stage 2 to
 * include NeMo Retriever for a vague healthcare prompt?
 *
 * Setup: feed the saved Exp 15 GoalSpecs for "chatbot for hospitals" (A =
 * baseline / ?draft=true, B = default loop) into Stage 2 generate-flow. Compare
 * the resulting service paths.
 *
 * Writes: docs/test-results/exp16/path-A-from-baseline.json and -B-from-loop.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Agent, setGlobalDispatcher } from 'undici';

setGlobalDispatcher(new Agent({ headersTimeout: 0, bodyTimeout: 0 }));

const OUT = 'docs/test-results/exp16';
mkdirSync(OUT, { recursive: true });

async function runStage2(label: string, goalSpec: unknown): Promise<void> {
  console.log(`\n── ${label} ────────────────────────`);
  const t0 = Date.now();
  const res = await fetch('http://localhost:3000/api/generate-flow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goalSpec }),
  });
  const latency = Date.now() - t0;
  if (!res.ok) {
    const body = await res.text();
    console.error(`HTTP ${res.status}: ${body.slice(0, 400)}`);
    return;
  }
  const data = (await res.json()) as {
    verified?: boolean;
    steps?: { serviceId: string; role: string; action: string; inputs: string[]; outputs: string[] }[];
    message?: string;
  };
  const out = { label, latencyMs: latency, ...data };
  writeFileSync(`${OUT}/path-${label}.json`, JSON.stringify(out, null, 2), 'utf8');
  console.log(`  latency: ${(latency / 1000).toFixed(1)}s`);
  console.log(`  verified: ${data.verified}`);
  console.log(`  steps (${data.steps?.length ?? 0}):`);
  for (const s of data.steps ?? []) {
    console.log(`    - ${s.serviceId}  — ${s.action.slice(0, 80)}`);
  }
  const hasRetriever = (data.steps ?? []).some((s) => /retriever/i.test(s.serviceId));
  console.log(`  retriever present: ${hasRetriever ? 'YES' : 'NO'}`);
}

async function main(): Promise<void> {
  const A = JSON.parse(readFileSync('docs/test-results/exp15/prompt0-A-baseline.json', 'utf8'));
  const B = JSON.parse(readFileSync('docs/test-results/exp15/prompt0-B-loop.json', 'utf8'));

  console.log('=== Exp 16: Stage 2 A/B — does loop GoalSpec produce Retriever? ===');
  console.log(`Input GoalSpec: "chatbot for hospitals"`);
  console.log(`A (baseline) perf=${A.goalSpec.performance_goals.length} inferred=${A.goalSpec.inferred_requirements.length}`);
  console.log(`B (loop)     perf=${B.goalSpec.performance_goals.length} inferred=${B.goalSpec.inferred_requirements.length}`);

  await runStage2('A-from-baseline', A.goalSpec);
  await runStage2('B-from-loop', B.goalSpec);
}

main().catch((e) => { console.error(e); process.exit(1); });
