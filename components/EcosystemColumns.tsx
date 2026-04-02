'use client';

import { useMemo } from 'react';
import LayerColumn from '@/components/LayerColumn';
import WaveDivider from '@/components/WaveDivider';
import { NVIDIA_SERVICES } from '@/data/nvidia';
import { getWorkflowNodeIds } from '@/lib/workflow';
import {
  LAYER_ORDER,
  type AppMode,
  type Layer,
  type Service,
  type Workflow,
} from '@/types/ecosystem';

interface EcosystemColumnsProps {
  mode: AppMode;
  activeWorkflow: Workflow | null;
  activeStepIndex: number;
  onHoverService: (service: Service | null) => void;
  onClickService: (service: Service) => void;
}

export default function EcosystemColumns({
  mode,
  activeWorkflow,
  activeStepIndex,
  onHoverService,
  onClickService,
}: EcosystemColumnsProps) {
  const workflowNodeIds = useMemo(
    () => (activeWorkflow ? getWorkflowNodeIds(activeWorkflow) : []),
    [activeWorkflow],
  );

  // Group services by layer preserving LAYER_ORDER
  const servicesByLayer = useMemo(() => {
    const map: Partial<Record<Layer, Service[]>> = {};
    for (const layer of LAYER_ORDER) {
      map[layer] = NVIDIA_SERVICES.filter((s) => s.layer === layer);
    }
    return map as Record<Layer, Service[]>;
  }, []);

  // A wave is "active" when both the left and right adjacent columns contain
  // at least one highlighted workflow node
  function isWaveActive(leftLayer: Layer, rightLayer: Layer): boolean {
    if (mode !== 'workflow' || !activeWorkflow) return false;
    const leftHas = servicesByLayer[leftLayer].some((s) =>
      workflowNodeIds.includes(s.id),
    );
    const rightHas = servicesByLayer[rightLayer].some((s) =>
      workflowNodeIds.includes(s.id),
    );
    return leftHas && rightHas;
  }

  return (
    <div className="flex flex-row h-full overflow-x-auto overflow-y-hidden pr-8">
      {LAYER_ORDER.map((layer, idx) => (
        <div key={layer} className="flex flex-row items-stretch">
          {idx > 0 && (
            <WaveDivider
              isActive={isWaveActive(LAYER_ORDER[idx - 1], layer)}
            />
          )}
          <LayerColumn
            layer={layer}
            services={servicesByLayer[layer]}
            mode={mode}
            activeWorkflow={activeWorkflow}
            activeStepIndex={activeStepIndex}
            workflowNodeIds={workflowNodeIds}
            onHoverService={onHoverService}
            onClickService={onClickService}
          />
        </div>
      ))}
    </div>
  );
}
