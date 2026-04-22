'use client';

/**
 * ServiceNode — custom React Flow node (hex shape, glassmorphism, NVIDIA green)
 *
 * Visual states:
 *   default    — visible, subtle green border
 *   dimmed     — desaturated & ~40% opacity (still legible, just de-emphasised)
 *   highlighted — bright green border + soft glow
 *   activeStep  — bright glow + pulsing radial overlay
 */

import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import type { Service, ServiceNodeData } from '@/types/ecosystem';

const GREEN    = '#76b900';
const HEX_CLIP = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
const NODE_W   = 180;
const NODE_H   = 100;

function ServiceNodeComponent({ data }: NodeProps) {
  const {
    service,
    stepNumber,
    isHighlighted,
    isDimmed,
    isActiveStep,
    isExploreMode,
    isSelected,
    focusLayer,
    onHover,
    onMouseMove,
  } = data as ServiceNodeData & {
    onMouseMove?: (service: Service, x: number, y: number) => void;
  };

  const [hovered, setHovered] = useState(false);

  // ── Layer focus (full node glow) ─────────────────────────────────────────
  // Clicking a layer header lights up every service in that layer with the
  // full treatment — green border, green-tinted background, drop-shadow.
  // Other layers' nodes are dimmed so the focused layer pops by contrast.
  const isLayerFocused = focusLayer != null && service.layer === focusLayer;
  const isLayerDimmed  = focusLayer != null && !isLayerFocused;

  // ── Click-on-node glow (perimeter only, explore mode only) ───────────────
  // User clicks a specific service in explore mode → that single node gets
  // a green border + drop-shadow so they can track which node they last
  // inspected. Background stays dark — that's the visual distinction vs
  // layer-focus ("full node glow"). Gated on explore mode so it never
  // appears in AI-path-generator / workflow modes.
  const showSelectedGlow = Boolean(isSelected && isExploreMode);

  // ── Visual state ─────────────────────────────────────────────────────────
  const borderColor = isActiveStep
    ? GREEN
    : isLayerFocused
    ? GREEN
    : showSelectedGlow
    ? GREEN
    : isHighlighted
    ? `${GREEN}cc`
    : hovered
    ? `${GREEN}55`
    : '#1e293b';

  // Background tint only for full-node glows (active step / highlighted path
  // / layer focus). `showSelectedGlow` intentionally does NOT tint the
  // background — it's perimeter only.
  const bgColor = isActiveStep || isHighlighted || isLayerFocused
    ? `${GREEN}12`
    : hovered
    ? `${GREEN}08`
    : 'rgba(8, 8, 8, 0.88)';

  const glowFilter = isActiveStep
    ? `drop-shadow(0 0 14px ${GREEN}) drop-shadow(0 0 28px ${GREEN}80)`
    : isLayerFocused
    ? `drop-shadow(0 0 12px ${GREEN}90) drop-shadow(0 0 4px ${GREEN}60)`
    : showSelectedGlow
    ? `drop-shadow(0 0 10px ${GREEN}80) drop-shadow(0 0 3px ${GREEN}60)`
    : isHighlighted
    ? `drop-shadow(0 0 8px ${GREEN}70)`
    : hovered
    ? `drop-shadow(0 0 6px ${GREEN}45)`
    : 'none';

  // `filter` must be on plain style (not motion.animate) — framer-motion can
  // not interpolate `drop-shadow(...) → none` cleanly and leaves the shadow
  // cached on the GPU compositor layer. Snapping via React re-render clears
  // it the moment focusLayer (or hovered/selected) flips off. We keep
  // opacity and scale inside framer-motion because those interpolate fine.
  const filterValue = isDimmed
    ? 'grayscale(0.6) brightness(0.55)'
    : isLayerDimmed
    ? 'grayscale(1) brightness(0.2)'
    : glowFilter;

  return (
    <motion.div
      className="relative select-none"
      style={{
        width: NODE_W + 4,
        height: NODE_H + 4,
        cursor: 'pointer',
        willChange: 'transform, opacity',
        filter: filterValue,
        // Short CSS transition for the filter so it fades instead of snapping
        // hard on/off. 180ms is short enough that it feels instant but soft.
        transition: 'filter 180ms ease-out',
      }}
      animate={{
        opacity: isDimmed ? 0.40 : isLayerDimmed ? 0.10 : 1,
        scale: hovered && !isDimmed && !isLayerDimmed
          ? 1.06
          : isLayerFocused && !hovered
          ? 1.04
          : showSelectedGlow && !hovered
          ? 1.03
          : 1,
      }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      onMouseEnter={(e) => {
        setHovered(true);
        if (!isExploreMode) {
          (onHover as (s: Service | null) => void)(service);
          (onMouseMove as ((s: Service, x: number, y: number) => void) | undefined)?.(
            service, e.clientX, e.clientY,
          );
        }
      }}
      onMouseMove={(e) => {
        if (!isExploreMode) {
          (onMouseMove as ((s: Service, x: number, y: number) => void) | undefined)?.(
            service, e.clientX, e.clientY,
          );
        }
      }}
      onMouseLeave={() => {
        setHovered(false);
        if (!isExploreMode) {
          (onHover as (s: Service | null) => void)(null);
        }
      }}
    >
      {/* Active-step radial pulse */}
      {isActiveStep && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{ clipPath: HEX_CLIP }}
          animate={{ opacity: [0.25, 0.65, 0.25] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div
            className="w-full h-full"
            style={{
              background: `radial-gradient(ellipse at center, ${GREEN}35 0%, transparent 68%)`,
            }}
          />
        </motion.div>
      )}

      {/* Outer hex — acts as border */}
      <div
        className="absolute inset-0"
        style={{ clipPath: HEX_CLIP, background: borderColor }}
      />

      {/* Inner hex — glassmorphism content */}
      <div
        className="absolute flex flex-col items-center justify-center gap-0.5"
        style={{
          top: 2, left: 4, right: 4, bottom: 2,
          clipPath:             HEX_CLIP,
          background:           bgColor,
          backdropFilter:       'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        <span className="text-[12px] font-bold text-white text-center leading-tight px-8 line-clamp-2">
          {service.name}
        </span>
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: `${GREEN}bb` }}
        >
          {service.tags[0]}
        </span>
      </div>

      {/* Step number badge */}
      {stepNumber !== undefined && (
        <div
          className="absolute -top-1.5 -right-1.5 w-[20px] h-[20px] rounded-full flex items-center justify-center text-[10px] font-black z-20"
          style={{
            background: isActiveStep ? GREEN : '#0d1117',
            color:      isActiveStep ? '#000' : GREEN,
            border:     `1.5px solid ${GREEN}`,
            boxShadow:  isActiveStep ? `0 0 10px ${GREEN}` : 'none',
          }}
        >
          {stepNumber}
        </div>
      )}

      {/* React Flow handles — invisible */}
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: 'transparent', border: 'none', width: 6, height: 6, left: 2 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: 'transparent', border: 'none', width: 6, height: 6, right: 2 }}
      />
    </motion.div>
  );
}

export default memo(ServiceNodeComponent, (prev, next) => {
  const pd = prev.data as ServiceNodeData;
  const nd = next.data as ServiceNodeData;
  return (
    pd.service.id    === nd.service.id    &&
    pd.isHighlighted === nd.isHighlighted &&
    pd.isDimmed      === nd.isDimmed      &&
    pd.isActiveStep  === nd.isActiveStep  &&
    pd.stepNumber    === nd.stepNumber    &&
    pd.isExploreMode === nd.isExploreMode &&
    pd.focusLayer    === nd.focusLayer    &&
    pd.isSelected    === nd.isSelected
  );
});
