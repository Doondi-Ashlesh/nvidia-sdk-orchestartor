/**
 * lib/validators/narrative.ts
 *
 * Enforces the narrative structure the notebook generator's system prompt
 * asks for: overview → setup → [baseline] → per-service implementation →
 * evaluation → summary.
 *
 * WHY: Phase 2 (previous work) tried to get narrative structure through
 * prompting alone. It worked ~60% of the time — the generator sometimes
 * ships a pure linear train-then-deploy flow with no baseline demo or
 * eval cell. This validator checks the actual output and re-prompts when
 * required sections are missing.
 *
 * SCOPE: heading-based detection. A notebook is "narrative-correct" when
 * markdown cells carry recognisable section headers that cover the required
 * phases. This is deliberately loose — we care that the user sees a story,
 * not that headings match word-for-word.
 *
 * ADAPTIVE: when the path contains training / fine-tuning services, we
 * require "baseline" and "before/after" sections. When it doesn't (pure
 * inference / deployment), those aren't required.
 *
 * Procedures: docs/procedures/02-validator.md
 */

import type { WorkflowStep } from '@/types/ecosystem';

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export type NarrativeSection =
  | 'overview'      // "what we're doing, why"
  | 'setup'         // pip installs, env vars
  | 'baseline'      // initial demo before improvement (only when training)
  | 'evaluation'    // metric / benchmark
  | 'summary';      // recap + next steps

export interface NarrativeViolation {
  code: 'missing_section';
  section: NarrativeSection;
  message: string;
  reprompt: string;
}

export interface NarrativeValidationResult {
  ok: boolean;
  violations: NarrativeViolation[];
  sectionsFound: NarrativeSection[];
  sectionsRequired: NarrativeSection[];
}

// ──────────────────────────────────────────────────────────────────────
// Heading-pattern matchers per section. Loose by design.
// ──────────────────────────────────────────────────────────────────────

const SECTION_PATTERNS: Record<NarrativeSection, RegExp[]> = {
  overview: [
    /^#\s*(overview|introduction|goal|what\s+we'?re\s+building|objective)/im,
    /\boverview\b/im,
    /\bintroduction\b/im,
  ],
  setup: [
    /^#+\s*(setup|prerequisites|installation|install|requirements|environment)/im,
    /\bpip\s+install\b/im,
    /\bprerequisites\b/im,
  ],
  baseline: [
    /^#+\s*(baseline|initial|before[\s-]?fine[\s-]?tun|before[\s-]?training|pretrained\s+inference|reference\s+run)/im,
    /\bbaseline\b/im,
    /\bbefore[\s-]?(finetun|training|improvement)/im,
  ],
  evaluation: [
    /^#+\s*(evaluat|metrics|benchmark|performance|results|validation)/im,
    /\bevaluat/im,
    /\b(accuracy|precision|recall|f1|auc|bleu|wer|perplexity)\b/im,
  ],
  summary: [
    /^#+\s*(summary|conclusion|next\s+steps|wrap[\s-]?up|recap)/im,
    /\bnext\s+steps\b/im,
    /\bsummary\b/im,
  ],
};

// ──────────────────────────────────────────────────────────────────────
// "Does the path imply training?" — determines baseline/eval requirements.
// ──────────────────────────────────────────────────────────────────────

const TRAINING_SERVICES = new Set([
  'nemo',
  'nemo-curator',
  'nemo-gym',
  'megatron-lm',
  'model-optimizer', // fine-tuning / QAT
]);

function pathHasTraining(steps: WorkflowStep[]): boolean {
  return steps.some((s) => TRAINING_SERVICES.has(s.serviceId));
}

// ──────────────────────────────────────────────────────────────────────
// Core validator
// ──────────────────────────────────────────────────────────────────────

export interface NarrativeCell {
  cell_type: 'code' | 'markdown' | string;
  source: string | string[];
}

export function validateNarrative(
  cells: NarrativeCell[],
  steps: WorkflowStep[],
): NarrativeValidationResult {
  // Concatenate all content — markdown for headings, code cells for any
  // inline # comments we might treat as weak signals.
  const allText = cells
    .map((c) => (Array.isArray(c.source) ? c.source.join('') : c.source))
    .filter((s): s is string => typeof s === 'string')
    .join('\n\n');

  // Which sections are required for THIS notebook?
  const hasTraining = pathHasTraining(steps);
  const sectionsRequired: NarrativeSection[] = [
    'overview',
    'setup',
    'evaluation',
    'summary',
  ];
  if (hasTraining) sectionsRequired.push('baseline');

  const sectionsFound: NarrativeSection[] = [];
  for (const section of (['overview', 'setup', 'baseline', 'evaluation', 'summary'] as NarrativeSection[])) {
    const patterns = SECTION_PATTERNS[section];
    const hit = patterns.some((p) => p.test(allText));
    if (hit) sectionsFound.push(section);
  }

  const missing = sectionsRequired.filter((s) => !sectionsFound.includes(s));
  const violations: NarrativeViolation[] = missing.map((section) => ({
    code: 'missing_section',
    section,
    message: `Notebook is missing a "${section}" section.`,
    reprompt: buildSectionReprompt(section, hasTraining),
  }));

  return {
    ok: violations.length === 0,
    violations,
    sectionsFound,
    sectionsRequired,
  };
}

function buildSectionReprompt(
  section: NarrativeSection,
  hasTraining: boolean,
): string {
  switch (section) {
    case 'overview':
      return 'Add an "Overview" markdown cell at the top of the notebook describing what the notebook does, what metrics it improves, and the expected outcome.';
    case 'setup':
      return 'Add a "Setup" / "Prerequisites" section near the top with a code cell that runs `!pip install ...` for all required packages and prints a check for env vars like NVIDIA_API_KEY.';
    case 'baseline':
      return hasTraining
        ? 'Add a "Baseline" section: run the pretrained model on a sample query BEFORE fine-tuning. Print the output so the reader can see the starting point. This is required because the path includes training.'
        : 'Add a "Baseline" section showing initial inference results before any customisation.';
    case 'evaluation':
      return 'Add an "Evaluation" section with a code cell that runs the model on a held-out set and prints concrete metrics (accuracy / F1 / WER / BLEU / AUC / recall — whichever fits the domain).';
    case 'summary':
      return 'Add a "Summary" / "Next Steps" markdown cell at the end recapping what was accomplished and suggesting how the reader can extend this.';
  }
}

export function buildNarrativeRepromptFeedback(
  result: NarrativeValidationResult,
): string {
  if (result.ok) return '';
  const lines = result.violations.map((v) => `- ${v.reprompt}`);
  return [
    'Your notebook is missing required narrative sections. Re-emit the JSON array with these sections added:',
    ...lines,
    '',
    `Sections found: ${result.sectionsFound.join(', ') || '(none)'}`,
    `Sections required: ${result.sectionsRequired.join(', ')}`,
  ].join('\n');
}
