/**
 * types/manifest.ts
 *
 * THE CONTRACT between the NAT agent (Python) and the visualizer (Next.js).
 *
 * The agent emits an ArchitectureManifest alongside the generated notebook.
 * The visualizer renders it as the comprehension layer:
 *   - each service becomes a node in the React Flow graph
 *   - connections become edges showing data flow
 *   - cellRefs link each node to the notebook cells that implement it
 *     (click a node → jump to / highlight those cells)
 *   - verification carries the per-service "does it run on real GPU" badge
 *
 * GRANULARITY DECISION (V2): linkage is at SERVICE granularity — a node maps
 * to a set of notebook cells. Edge-granularity (a specific data-flow handoff
 * mapping to a specific cell) is a FUTURE additive field (`ManifestConnection.
 * implementingCell`) and does not require a schema change to introduce.
 *
 * This shape intentionally aligns with the existing `WorkflowStep` /
 * `Service` types in ecosystem.ts so the visualizer reuses its node/edge
 * rendering with minimal new code.
 */

import type { Layer } from './ecosystem';

/** Per-service verification outcome from the real-GPU heal pass. */
export type VerificationStatus =
  | 'passed'              // every cell for this service ran clean on GPU
  | 'passed_with_stubs'   // ran, but contains REQUIRES-EXTERNAL-SYSTEM stubs
  | 'requires_gpu'        // skipped on this tier; needs Tier-B hardware
  | 'unresolved'          // heal loop could not make it run
  | 'not_run';            // verification not yet executed

/** One service in the tailored architecture. Becomes a graph node. */
export interface ManifestService {
  /** Canonical service id from data/nvidia.ts (e.g. "nim", "nemo-retriever") */
  id: string;
  /** Display name */
  name: string;
  /** What this service does IN THIS tailored solution (not the generic blurb) */
  role: string;
  /** Stack layer — drives left→right graph ordering */
  layer: Layer;
  /**
   * Notebook cell indices that implement this service. THE linkage that powers
   * click-node → highlight-cells. Empty if the service is referenced but not
   * yet implemented in a cell.
   */
  cellRefs: number[];
  /** Per-service verification result from the GPU heal pass */
  verification: VerificationStatus;
}

/** A directed data-flow edge between two services. Becomes a graph edge. */
export interface ManifestConnection {
  /** source service id */
  from: string;
  /** target service id */
  to: string;
  /** Plain-language description of what data flows across this edge */
  data: string;
  /**
   * FUTURE (edge-granularity linkage): the notebook cell that implements this
   * specific handoff. Optional now; populating it later is non-breaking.
   */
  implementingCell?: number;
}

/** Provenance + grounding info for the tailored solution. */
export interface ManifestProvenance {
  /** The use case the agent tailored for */
  useCase: string;
  /** Blueprint id the agent grounded on (null = generated from scratch) */
  blueprintId: string | null;
  /** Model + endpoint that did the generation */
  model: string;
  /** Agent run id, for tracing back to the Phoenix trace */
  agentRunId: string;
  /** ISO timestamp, stamped by the caller after the agent returns */
  generatedAt: string;
  /** Total notebook cell count, for sanity-checking cellRefs */
  totalCells: number;
}

/**
 * The complete artifact the agent emits next to the notebook.
 * The visualizer consumes exactly this; nothing else.
 */
export interface ArchitectureManifest {
  schemaVersion: 1;
  provenance: ManifestProvenance;
  services: ManifestService[];
  connections: ManifestConnection[];
  /**
   * Overall verification summary, surfaced as a headline badge.
   * Derived from the per-service verification fields.
   */
  verificationSummary: {
    codeCells: number;
    passed: number;
    requiresGpu: number;
    externalRequired: number;
    unresolved: number;
  };
}
