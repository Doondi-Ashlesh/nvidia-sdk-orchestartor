/**
 * Blueprint matcher — score each registered blueprint against the
 * incoming GoalSpec + Stage 2 service path, return the best match or
 * null (novel domain / nothing fits well enough to risk anchoring).
 *
 * Design notes (why this is more conservative than Exp 7's loose match):
 *   Exp 7 injected blueprint ground truth into the Stage 1 planner
 *   prompt with keyword-only matching and fired the "RAG" blueprint
 *   on drone navigation. Templates in, templates out. Lost 6-2 vs
 *   a baseline planner.
 *
 *   We avoid that failure mode in three ways:
 *     1. Matching happens at Stage 3 (notebook), NOT Stage 1 (planner).
 *        The planner stays creative and input-driven.
 *     2. The no-match threshold is set high enough that keyword hits
 *        like "pipeline" / "system" / "deploy" alone don't fire a
 *        blueprint. Match requires specific domain vocabulary.
 *     3. We use BOTH keyword match AND service-path overlap. A
 *        blueprint only wins when the user's actual services (picked
 *        by the independent data-flow Stage 2) align with the
 *        blueprint's services.
 *
 *   Net: for the 3 domains we test on (chatbot / healthcare chatbot /
 *   fraud detection), the two blueprints should reliably fire. For
 *   anything else — drones, climate, retail, novel domains — the
 *   matcher returns null and the pipeline falls through to
 *   from-scratch generation. No regression vs the current codebase.
 */

import { BLUEPRINTS, type BlueprintRecord } from '@/lib/blueprints';
import type { GoalSpec, WorkflowStep } from '@/types/ecosystem';

// ── Scoring weights ─────────────────────────────────────────────────────────
// Tunable via experimentation. Current values picked to make both test
// prompts (healthcare chatbot → enterprise-rag, fraud → fraud-detection)
// score >= MATCH_THRESHOLD while keeping novel-domain scores below it.

const KEYWORD_WEIGHT           = 1.0;
const SERVICE_OVERLAP_WEIGHT   = 1.5;  // service-path alignment is stronger evidence than keywords

/** Minimum score to consider a blueprint "a match". Below this, return null. */
const MATCH_THRESHOLD          = 3.0;

/** Minimum number of keyword hits required regardless of other score. */
const MIN_KEYWORD_HITS         = 2;

// ── Types ───────────────────────────────────────────────────────────────────

export interface BlueprintMatchResult {
  /** The matched blueprint — or null if none scored high enough. */
  blueprint: BlueprintRecord | null;
  /** All blueprint scores (diagnostic), sorted high to low. */
  scores: { id: BlueprintRecord['id']; score: number; keywordHits: number; serviceOverlap: number }[];
  /** Human-readable explanation of what happened, for log surfaces. */
  reason: string;
}

// ── Matching logic ──────────────────────────────────────────────────────────

/** Lowercase join of all text-ish GoalSpec fields for keyword scanning. */
function goalSpecText(goalSpec: GoalSpec): string {
  const parts: string[] = [
    goalSpec.domain ?? '',
    goalSpec.use_case_type ?? '',
    goalSpec.summary ?? '',
    ...(goalSpec.inferred_requirements ?? []).map((r) => r.requirement ?? ''),
    ...(goalSpec.performance_goals ?? []).map((g) => g.metric ?? ''),
  ];
  return parts.join(' ').toLowerCase();
}

/** Count how many of the blueprint's keywords appear in the haystack. */
function countKeywordHits(keywords: string[], haystack: string): number {
  return keywords.filter((kw) => haystack.includes(kw.toLowerCase())).length;
}

/** Count how many of the blueprint's services appear in the user's path. */
function countServiceOverlap(blueprintServices: string[], pathServices: string[]): number {
  const pathSet = new Set(pathServices);
  return blueprintServices.filter((s) => pathSet.has(s)).length;
}

/**
 * Score a single blueprint against a GoalSpec + service path. Higher score
 * = better match. Keyword hits + service-path overlap both contribute.
 */
function scoreBlueprint(
  blueprint: BlueprintRecord,
  goalSpec: GoalSpec,
  steps: WorkflowStep[],
): { score: number; keywordHits: number; serviceOverlap: number } {
  const haystack = goalSpecText(goalSpec);
  const pathServices = steps.map((s) => s.serviceId);

  const keywordHits    = countKeywordHits(blueprint.matchKeywords, haystack);
  const serviceOverlap = countServiceOverlap(blueprint.servicePath, pathServices);

  const score =
    keywordHits    * KEYWORD_WEIGHT +
    serviceOverlap * SERVICE_OVERLAP_WEIGHT;

  return { score, keywordHits, serviceOverlap };
}

/**
 * Pick the best blueprint for this (GoalSpec, path) — or null if no
 * blueprint clears the match threshold. Returns full scoring diagnostics
 * so the route can log what happened.
 */
export function matchBlueprint(
  goalSpec: GoalSpec,
  steps: WorkflowStep[],
): BlueprintMatchResult {
  const scores = BLUEPRINTS.map((bp) => {
    const { score, keywordHits, serviceOverlap } = scoreBlueprint(bp, goalSpec, steps);
    return { id: bp.id, score, keywordHits, serviceOverlap };
  }).sort((a, b) => b.score - a.score);

  const top = scores[0];

  // Gate 1: minimum keyword hits
  if (!top || top.keywordHits < MIN_KEYWORD_HITS) {
    return {
      blueprint: null,
      scores,
      reason: `no-match: top=${top?.id ?? '(none)'} keywordHits=${top?.keywordHits ?? 0} < ${MIN_KEYWORD_HITS}`,
    };
  }

  // Gate 2: combined score threshold
  if (top.score < MATCH_THRESHOLD) {
    return {
      blueprint: null,
      scores,
      reason: `no-match: top=${top.id} score=${top.score.toFixed(1)} < ${MATCH_THRESHOLD}`,
    };
  }

  // Match!
  const blueprint = BLUEPRINTS.find((b) => b.id === top.id) ?? null;
  return {
    blueprint,
    scores,
    reason: `match: ${top.id} score=${top.score.toFixed(1)} keywords=${top.keywordHits} services=${top.serviceOverlap}`,
  };
}
