/**
 * scripts/deploy-and-validate.ts  —  Tier 0 deployment validator
 *
 * Provisions a fresh Brev instance, copies the generated notebook + the
 * existing nbclient-based executor, runs the notebook on real GPU
 * hardware, pulls back the executed notebook + a structured per-cell
 * report, then tears the instance down.
 *
 * This is the deterministic, no-agent path. It answers a single question:
 *   "does this notebook execute end-to-end on a fresh Brev instance?"
 *
 * Use this when:
 *   - You want a cheap, fast, repeatable check before/after a heal pass
 *   - You're A/B-testing prompt changes and need a deterministic measurement
 *   - You don't have an Anthropic API key handy
 *
 * For the heal flow (Claude Code agent fixing failing cells on Brev):
 *   See docs/procedures/08-notebook-heal.md
 *   The agent owns the brev create/scp/ssh/delete lifecycle directly —
 *   no orchestrator script. This file is intentionally not part of that flow.
 *
 * Usage:
 *   npx tsx scripts/deploy-and-validate.ts <input.ipynb> \
 *     [--gpu=A10G] [--keep] [--name=<custom>]
 *
 * Writes (next to <input.ipynb>):
 *   <input>.executed.ipynb   — the notebook with cell outputs from real run
 *   <input>.report.json      — per-cell pass/fail with tracebacks
 *   <input>.runbook.txt      — every CLI command the script ran
 *
 * Exit codes:
 *   0 — instance up, notebook ran, all code cells passed
 *   1 — instance up, notebook ran, ≥1 code cell failed
 *   2 — infra failure (provision/scp/ssh broke before notebook could run)
 *
 * The instance is ALWAYS torn down on exit unless --keep is passed.
 *
 * Pre-reqs on the local machine:
 *   - `brev` CLI installed and authenticated (`brev login`)
 *   - `ssh` + `scp` on PATH
 */

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';

// ──────────────────────────────────────────────────────────────────────
// CLI args
// ──────────────────────────────────────────────────────────────────────

const inputPath = process.argv[2];
if (!inputPath || !existsSync(inputPath)) {
  console.error('usage: deploy-and-validate.ts <input.ipynb> [--gpu=A10G] [--keep] [--name=<custom>]');
  process.exit(2);
}

const argMap = new Map<string, string>();
const flags = new Set<string>();
for (const a of process.argv.slice(3)) {
  const kv = a.match(/^--(\w[\w-]*)=(.*)$/);
  if (kv) argMap.set(kv[1], kv[2]);
  else if (a.startsWith('--')) flags.add(a.slice(2));
}

const gpu = argMap.get('gpu') ?? 'A10G';
const instanceName =
  argMap.get('name') ??
  `sdk-orch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const keep = flags.has('keep');

const inputAbs = path.resolve(inputPath);
const baseName = path.basename(inputAbs, '.ipynb');
const outDir = path.dirname(inputAbs);
const executedPath = path.join(outDir, `${baseName}.executed.ipynb`);
const reportPath = path.join(outDir, `${baseName}.report.json`);
const runbookPath = path.join(outDir, `${baseName}.runbook.txt`);
const localExecutorPath = path.resolve(__dirname, 'archive', 'execute-notebook.py');

// ──────────────────────────────────────────────────────────────────────
// Runbook logger — every command we run is appended here so the user
// gets a literal deployment recipe back, not just a notebook.
// ──────────────────────────────────────────────────────────────────────

writeFileSync(
  runbookPath,
  `# deploy-and-validate runbook\n# instance: ${instanceName}\n# gpu: ${gpu}\n# started: ${new Date().toISOString()}\n\n`,
);

function logCmd(cmd: string, args: string[], result: SpawnSyncReturns<string>) {
  const line = `$ ${cmd} ${args.join(' ')}\n`;
  const tail =
    result.status === 0
      ? ''
      : `# exit=${result.status}\n# stderr: ${(result.stderr ?? '').slice(0, 500)}\n`;
  appendFileSync(runbookPath, line + tail + '\n');
}

function run(
  cmd: string,
  args: string[],
  opts: { allowFailure?: boolean; timeoutMs?: number } = {},
): SpawnSyncReturns<string> {
  console.error(`→ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: opts.timeoutMs,
  });
  logCmd(cmd, args, r);
  if (r.status !== 0 && !opts.allowFailure) {
    console.error(`command failed (exit ${r.status}):\n${r.stderr}`);
  }
  return r;
}

// ──────────────────────────────────────────────────────────────────────
// Brev CLI wrappers
// ──────────────────────────────────────────────────────────────────────

function brevCreate(): boolean {
  return run('brev', ['create', instanceName, '--gpu', gpu, '--detached']).status === 0;
}

function brevWaitReady(timeoutSec = 600): boolean {
  // 8s poll interval — under cache TTL, doesn't hammer Brev's API
  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    const r = run('brev', ['ls', '--json'], { allowFailure: true });
    if (r.status === 0) {
      try {
        const list = JSON.parse(r.stdout) as Array<{ name: string; status: string }>;
        const me = list.find((x) => x.name === instanceName);
        if (me?.status === 'RUNNING') return true;
        if (me?.status === 'FAILED') return false;
      } catch {
        /* `brev ls` output format can drift; just retry */
      }
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 8000);
  }
  return false;
}

function brevRefreshSsh(): boolean {
  return run('brev', ['refresh']).status === 0;
}

function brevDelete(): void {
  // Best-effort teardown. Logged but never throws — we're already in cleanup.
  run('brev', ['delete', instanceName, '--yes'], { allowFailure: true });
}

// ──────────────────────────────────────────────────────────────────────
// Remote setup + execution
// ──────────────────────────────────────────────────────────────────────

const REMOTE_DIR = '/tmp/sdk-orch-run';
const REMOTE_NB_IN = `${REMOTE_DIR}/notebook.ipynb`;
const REMOTE_NB_OUT = `${REMOTE_DIR}/notebook.executed.ipynb`;
const REMOTE_EXECUTOR = `${REMOTE_DIR}/execute-notebook.py`;
const REMOTE_REPORT = `${REMOTE_DIR}/report.json`;

function remoteSetup(): boolean {
  // Idempotent — pip install no-ops if already present. We pin minimums to
  // match what execute-notebook.py was tested against.
  const setup = [
    `mkdir -p ${REMOTE_DIR}`,
    `pip install --quiet 'nbclient>=0.10' 'nbformat>=5.10' 'ipykernel>=6.29'`,
    `python3 -m ipykernel install --user --name python3 --display-name 'Python 3' >/dev/null 2>&1 || true`,
  ].join(' && ');
  return run('ssh', [instanceName, setup]).status === 0;
}

function pushArtifacts(): boolean {
  const a = run('scp', [inputAbs, `${instanceName}:${REMOTE_NB_IN}`]);
  const b = run('scp', [localExecutorPath, `${instanceName}:${REMOTE_EXECUTOR}`]);
  return a.status === 0 && b.status === 0;
}

function remoteExecute(): { exitCode: number; report: unknown } {
  const cmd = `cd ${REMOTE_DIR} && CELL_TIMEOUT=600 python3 ${REMOTE_EXECUTOR} ${REMOTE_NB_IN} ${REMOTE_NB_OUT} python3 > ${REMOTE_REPORT} 2>&1 ; echo "EXIT=$?"`;
  const r = run('ssh', [instanceName, cmd], { allowFailure: true, timeoutMs: 60 * 60_000 });
  // Pull the report and executed notebook regardless of exit code.
  run('scp', [`${instanceName}:${REMOTE_REPORT}`, reportPath], { allowFailure: true });
  run('scp', [`${instanceName}:${REMOTE_NB_OUT}`, executedPath], { allowFailure: true });
  const m = r.stdout.match(/EXIT=(\d+)/);
  const exitCode = m ? parseInt(m[1], 10) : 2;
  let report: unknown = null;
  try {
    if (existsSync(reportPath)) report = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch {
    /* report wasn't valid JSON */
  }
  return { exitCode, report };
}

// ──────────────────────────────────────────────────────────────────────
// Main — try/finally guarantees teardown
// ──────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  console.error(`\n=== validate: ${baseName} → ${instanceName} (${gpu}) ===\n`);

  if (!brevCreate()) return 2;
  if (!brevWaitReady()) {
    console.error('instance failed to reach RUNNING within timeout');
    return 2;
  }
  if (!brevRefreshSsh()) return 2;
  if (!remoteSetup()) return 2;
  if (!pushArtifacts()) return 2;

  const { exitCode, report } = remoteExecute();

  if (report && typeof report === 'object' && 'summary' in report) {
    const s = (report as { summary: { code_ok: number; code_error: number; code: number } }).summary;
    console.error(`\n=== result: ${s.code_ok}/${s.code} cells passed (${s.code_error} failed) ===`);
  } else {
    console.error('\n=== result: no structured report (likely infra failure) ===');
  }
  console.error(
    `\nartifacts:\n  notebook → ${executedPath}\n  report   → ${reportPath}\n  runbook  → ${runbookPath}\n`,
  );
  return exitCode;
}

let final = 2;
try {
  final = await main();
} catch (e) {
  console.error('uncaught:', e);
  final = 2;
} finally {
  if (!keep) {
    brevDelete();
  } else {
    console.error(
      `(--keep set; instance "${instanceName}" left running — delete with: brev delete ${instanceName})`,
    );
  }
  appendFileSync(runbookPath, `\n# finished: ${new Date().toISOString()}\n# exit: ${final}\n`);
}
process.exit(final);
