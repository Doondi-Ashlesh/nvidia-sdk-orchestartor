'use client';

import { motion } from 'framer-motion';
import ServiceHex from '@/components/ServiceHex';
import {
  LAYER_COLORS,
  LAYER_LABELS,
  LAYER_SUBLABELS,
  type AppMode,
  type Layer,
  type Service,
  type Workflow,
} from '@/types/ecosystem';

interface LayerColumnProps {
  layer: Layer;
  services: Service[];
  mode: AppMode;
  activeWorkflow: Workflow | null;
  activeStepIndex: number;
  workflowNodeIds: string[];
  onHoverService: (service: Service | null) => void;
  onClickService: (service: Service) => void;
}

export default function LayerColumn({
  layer,
  services,
  mode,
  activeWorkflow,
  activeStepIndex,
  workflowNodeIds,
  onHoverService,
  onClickService,
}: LayerColumnProps) {
  const lc = LAYER_COLORS[layer];

  // Column-level opacity: in initial mode everything is dim; in workflow mode
  // columns not containing any workflow node are extra dim
  const hasWorkflowNode = services.some((s) => workflowNodeIds.includes(s.id));
  const columnDim =
    mode === 'initial' ||
    (mode === 'workflow' && !hasWorkflowNode);

  return (
    <motion.div
      className="flex flex-col shrink-0"
      style={{ width: 210 }}
      animate={{ opacity: columnDim ? 0.25 : 1 }}
      transition={{ duration: 0.35 }}
    >
      {/* Column header */}
      <div
        className="px-4 py-4 border-b mb-4 shrink-0"
        style={{ borderColor: `${lc.hex}30` }}
      >
        <div className="flex items-center gap-2 mb-1">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: lc.hex, boxShadow: `0 0 6px ${lc.hex}` }}
          />
          <span className="text-white font-bold text-sm tracking-wide">
            {LAYER_LABELS[layer]}
          </span>
        </div>
        <p className="text-[10px] text-slate-500 leading-snug pl-4">
          {LAYER_SUBLABELS[layer]}
        </p>
      </div>

      {/* Hex nodes */}
      <div className="flex flex-col items-center gap-4 px-2 pb-6 overflow-y-auto flex-1">
        {services.map((service) => {
          // Determine step number if service is in the active workflow
          const stepIdx = activeWorkflow?.steps.findIndex(
            (s) => s.serviceId === service.id,
          );
          const stepNumber =
            stepIdx !== undefined && stepIdx >= 0 ? stepIdx + 1 : undefined;

          const isHighlighted =
            mode === 'workflow' && workflowNodeIds.includes(service.id);
          const isDimmed =
            mode === 'workflow' && !workflowNodeIds.includes(service.id);
          const isActiveStep =
            mode === 'workflow' &&
            activeWorkflow?.steps[activeStepIndex]?.serviceId === service.id;

          return (
            <ServiceHex
              key={service.id}
              service={service}
              stepNumber={stepNumber}
              isHighlighted={isHighlighted}
              isDimmed={isDimmed}
              isActiveStep={isActiveStep}
              onHover={onHoverService}
              onClick={onClickService}
            />
          );
        })}
      </div>
    </motion.div>
  );
}
