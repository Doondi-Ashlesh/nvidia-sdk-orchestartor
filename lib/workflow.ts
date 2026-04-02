import type { Workflow } from '@/types/ecosystem';

/** Returns the service IDs that are part of the given workflow. */
export function getWorkflowNodeIds(workflow: Workflow): string[] {
  return workflow.steps.map((s) => s.serviceId);
}

/**
 * Returns consecutive [sourceId, targetId] pairs for the workflow steps.
 * Used to identify which edges to highlight/animate.
 */
export function getWorkflowEdgePairs(workflow: Workflow): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < workflow.steps.length - 1; i++) {
    pairs.push([workflow.steps[i].serviceId, workflow.steps[i + 1].serviceId]);
  }
  return pairs;
}

/**
 * Returns true if the given [source, target] edge pair is part of the workflow path.
 */
export function isWorkflowEdge(
  sourceId: string,
  targetId: string,
  workflow: Workflow | null,
): boolean {
  if (!workflow) return false;
  const pairs = getWorkflowEdgePairs(workflow);
  return pairs.some(([s, t]) => s === sourceId && t === targetId);
}
