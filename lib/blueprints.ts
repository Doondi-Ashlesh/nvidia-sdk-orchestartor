/**
 * Blueprint metadata registry.
 *
 * Each entry here describes one NVIDIA AI Blueprint notebook that we
 * carry in `data/blueprints/*.ipynb` and can parameterize into a
 * tailored Stage 3 output.
 *
 * Why this exists (class-level fix):
 *   Exp 17 + 18 showed that from-scratch Stage 3 generation repeatedly
 *   labels cells "NeMo Guardrails" / "NeMo Curator" / "NeMo Evaluator"
 *   but implements them with Python regex / HuggingFace / sklearn
 *   equivalents — the labels are cosmetic. When the source cells come
 *   from NVIDIA's own blueprint, they use the real SDK APIs by
 *   construction (e.g. `RailsConfig.from_path()` + `LLMRails(...)`
 *   rather than Python dict lookups).
 *
 * How matching works:
 *   `lib/blueprint-matcher.ts` scores each entry against the incoming
 *   GoalSpec (domain + use_case_type + compliance + summary). The
 *   highest-scoring entry above a confidence threshold wins;
 *   everything below returns null and the route falls through to
 *   from-scratch generation (no regression for novel domains).
 *
 * How parameterization works:
 *   `lib/blueprint-parameterizer.ts` loads the `.ipynb` at `ipynbPath`
 *   and performs token substitution over its cell sources for the
 *   slot names listed in `parameterizableSlots`. Slots are always
 *   uppercase snake_case wrapped in `{{ }}`.
 */

import type { GoalSpec, WorkflowStep } from '@/types/ecosystem';

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * The named substitution slots a blueprint declares. When the
 * matcher picks a blueprint, the parameterizer fills these in
 * from the incoming GoalSpec. Unfilled slots are left as literal
 * `{{SLOT_NAME}}` in the output — which is intentional: it makes
 * any missing-slot bug visible rather than silently wrong.
 */
export type BlueprintSlot =
  | 'GOAL'
  | 'DOMAIN'
  | 'USE_CASE_TYPE'
  | 'COMPLIANCE_LIST'
  | 'TARGET_LATENCY_MS'
  | 'TARGET_ACCURACY'
  | 'TARGET_RECALL'
  | 'TARGET_FPR'
  | 'TARGET_TPS'
  | 'SUMMARY'
  | 'INFERRED_REQUIREMENTS';

/**
 * A fn that extracts a string value for a slot from the (GoalSpec, steps)
 * inputs. Returning an empty string is fine; the parameterizer leaves
 * the literal `{{SLOT}}` token in place so the output is debuggable.
 */
export type SlotResolver = (
  goalSpec: GoalSpec,
  steps: WorkflowStep[],
) => string;

export interface BlueprintRecord {
  /** Stable identifier + filename stem (matches `data/blueprints/<id>.ipynb`). */
  id: 'enterprise-rag' | 'fraud-detection';

  /** Human-readable title — shown to the user in logs and, later, the UI. */
  title: string;

  /** Short one-sentence description of what the blueprint covers. */
  description: string;

  /** Upstream source so we can resync when NVIDIA updates the blueprint. */
  source: {
    repo: string;
    file: string;
    commitSha: string | null; // null until we pin a real commit
  };

  /**
   * Keywords that should appear in the GoalSpec (domain + use_case_type
   * + summary) to consider this blueprint a match. Scoring is per-keyword
   * hit; more hits = stronger match. Matcher uses a no-match threshold
   * to avoid firing on novel domains (Exp 7 lesson — loose matching
   * hurts more than it helps).
   */
  matchKeywords: string[];

  /**
   * NVIDIA service IDs this blueprint's path uses. When the Stage 2 path
   * overlaps meaningfully with this list, it's strong evidence the
   * blueprint is a good fit (complements keyword matching).
   */
  servicePath: string[];

  /** Path (relative to repo root) of the .ipynb file to load. */
  ipynbPath: string;

  /**
   * Slots the blueprint's cells contain as `{{TOKEN}}` placeholders.
   * The parameterizer fills these in from the GoalSpec. Unlisted
   * slots remain literal so missing-slot bugs are visible.
   */
  parameterizableSlots: Record<BlueprintSlot, SlotResolver>;
}

// ── Helpers for building slot resolvers ────────────────────────────────────

/** Serialize a compliance list as `HIPAA, GDPR, FDA SaMD`. */
function complianceAsList(gs: GoalSpec): string {
  return gs.constraints?.compliance?.join(', ') ?? '';
}

/** Extract the first performance goal whose metric matches a substring. */
function firstMatchingPerfGoal(
  gs: GoalSpec,
  substring: string,
): string {
  const needle = substring.toLowerCase();
  const hit = (gs.performance_goals ?? []).find(
    (g) => g.metric?.toLowerCase().includes(needle),
  );
  return hit?.target ?? '';
}

// ── Registry ────────────────────────────────────────────────────────────────

export const BLUEPRINTS: BlueprintRecord[] = [
  // ═════════════════════════════════════════════════════════════════════════
  {
    id: 'enterprise-rag',
    title: 'NVIDIA Enterprise RAG',
    description:
      'Full RAG pipeline — document ingest + retrieval + Guardrails-wrapped LLM + Milvus vector store. ' +
      'Covers generic chatbots and healthcare conversational assistants (EHR-anchored retrieval).',
    source: {
      repo: 'https://github.com/NVIDIA-AI-Blueprints/rag',
      file: 'notebooks/launchable.ipynb',
      commitSha: null, // pin once we download the real .ipynb
    },
    matchKeywords: [
      'chatbot',
      'conversational',
      'virtual assistant',
      'rag',
      'retrieval',
      'hospital',
      'healthcare',
      'clinical',
      'patient',
      'ehr',
      'customer service',
      'question answering',
    ],
    servicePath: [
      'nemo-retriever',
      'nemo-curator',
      'nemo',
      'nemo-guardrails',
      'nemo-evaluator',
      'triton',
      'ai-enterprise',
    ],
    ipynbPath: 'data/blueprints/enterprise-rag.ipynb',
    parameterizableSlots: {
      GOAL: (gs) => gs.summary ?? '',
      DOMAIN: (gs) => gs.domain ?? '',
      USE_CASE_TYPE: (gs) => gs.use_case_type ?? '',
      COMPLIANCE_LIST: (gs) => complianceAsList(gs),
      TARGET_LATENCY_MS: (gs) => firstMatchingPerfGoal(gs, 'latency'),
      TARGET_ACCURACY: (gs) => firstMatchingPerfGoal(gs, 'accuracy'),
      TARGET_RECALL: (gs) => firstMatchingPerfGoal(gs, 'recall'),
      TARGET_FPR: (gs) => firstMatchingPerfGoal(gs, 'false'),
      TARGET_TPS: (gs) => firstMatchingPerfGoal(gs, 'throughput'),
      SUMMARY: (gs) => gs.summary ?? '',
      INFERRED_REQUIREMENTS: (gs) =>
        (gs.inferred_requirements ?? [])
          .map((r) => `- ${r.requirement}`)
          .join('\n'),
    },
  },

  // ═════════════════════════════════════════════════════════════════════════
  {
    id: 'fraud-detection',
    title: 'NVIDIA Real-Time Fraud Detection (GNN)',
    description:
      'RAPIDS feature engineering + Graph Neural Network training (DGL / cuGraph) + TensorRT optimization ' +
      '+ Triton serving. Covers real-time transaction fraud detection and similar tabular-streaming use cases.',
    source: {
      repo: 'https://github.com/NVIDIA-AI-Blueprints/fraud-detection',
      file: 'notebooks/blueprint.ipynb',
      commitSha: null, // pin once we download the real .ipynb
    },
    matchKeywords: [
      'fraud',
      'transaction',
      'banking',
      'credit card',
      'anti-money laundering',
      'aml',
      'real-time',
      'gnn',
      'graph neural',
      'tabular',
    ],
    servicePath: [
      'rapids',
      'tensorrt',
      'model-optimizer',
      'triton',
      'ai-enterprise',
    ],
    ipynbPath: 'data/blueprints/fraud-detection.ipynb',
    parameterizableSlots: {
      GOAL: (gs) => gs.summary ?? '',
      DOMAIN: (gs) => gs.domain ?? '',
      USE_CASE_TYPE: (gs) => gs.use_case_type ?? '',
      COMPLIANCE_LIST: (gs) => complianceAsList(gs),
      TARGET_LATENCY_MS: (gs) => firstMatchingPerfGoal(gs, 'latency'),
      TARGET_ACCURACY: (gs) => firstMatchingPerfGoal(gs, 'accuracy'),
      TARGET_RECALL: (gs) => firstMatchingPerfGoal(gs, 'recall'),
      TARGET_FPR: (gs) => firstMatchingPerfGoal(gs, 'false'),
      TARGET_TPS: (gs) => firstMatchingPerfGoal(gs, 'throughput'),
      SUMMARY: (gs) => gs.summary ?? '',
      INFERRED_REQUIREMENTS: (gs) =>
        (gs.inferred_requirements ?? [])
          .map((r) => `- ${r.requirement}`)
          .join('\n'),
    },
  },
];

/** Look up a blueprint record by its id. */
export function getBlueprintById(
  id: BlueprintRecord['id'],
): BlueprintRecord | undefined {
  return BLUEPRINTS.find((b) => b.id === id);
}
