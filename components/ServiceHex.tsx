'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { LAYER_COLORS, type Service } from '@/types/ecosystem';

interface ServiceHexProps {
  service: Service;
  /** Step number badge (1-based) shown when part of active workflow */
  stepNumber?: number;
  isHighlighted: boolean;
  isDimmed: boolean;
  isActiveStep: boolean;
  /** Explore mode: hover shows details in sidebar */
  onHover?: (service: Service | null) => void;
  onClick?: (service: Service) => void;
}

const HEX_W = 172;
const HEX_H = 96;
// pointy-side hexagon: flat top+bottom, points left+right
const HEX_CLIP = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';

export default function ServiceHex({
  service,
  stepNumber,
  isHighlighted,
  isDimmed,
  isActiveStep,
  onHover,
  onClick,
}: ServiceHexProps) {
  const [isHovered, setIsHovered] = useState(false);
  const lc = LAYER_COLORS[service.layer];

  const bgColor = isHighlighted || isActiveStep
    ? `${lc.hex}18`
    : isHovered
      ? `${lc.hex}10`
      : '#0d1117';

  const borderColor = isActiveStep
    ? lc.hex
    : isHighlighted
      ? `${lc.hex}cc`
      : isHovered
        ? `${lc.hex}60`
        : '#1e293b';

  const glowFilter = isActiveStep
    ? `drop-shadow(0 0 10px ${lc.hex}) drop-shadow(0 0 20px ${lc.glow})`
    : isHighlighted
      ? `drop-shadow(0 0 6px ${lc.glow})`
      : isHovered
        ? `drop-shadow(0 0 4px ${lc.dim})`
        : 'none';

  return (
    <motion.div
      className="relative cursor-pointer select-none"
      style={{ width: HEX_W + 4, height: HEX_H + 4 }}
      animate={{
        opacity: isDimmed ? 0.18 : 1,
        filter: isDimmed ? 'grayscale(1)' : glowFilter,
      }}
      transition={{ duration: 0.3 }}
      onMouseEnter={() => {
        setIsHovered(true);
        onHover?.(service);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        onHover?.(null);
      }}
      onClick={() => onClick?.(service)}
    >
      {/* Active step pulse ring */}
      {isActiveStep && (
        <motion.div
          className="absolute inset-0"
          style={{ clipPath: HEX_CLIP }}
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div
            className="w-full h-full"
            style={{
              background: `radial-gradient(ellipse at center, ${lc.hex}30 0%, transparent 70%)`,
            }}
          />
        </motion.div>
      )}

      {/* Outer hex — border color */}
      <div
        className="absolute inset-0"
        style={{ clipPath: HEX_CLIP, background: borderColor }}
      />

      {/* Inner hex — content */}
      <div
        className="absolute"
        style={{
          top: 2,
          left: 4,
          right: 4,
          bottom: 2,
          clipPath: HEX_CLIP,
          background: bgColor,
        }}
      >
        <div className="flex flex-col items-center justify-center h-full px-10 gap-0.5">
          <span className="text-[11px] font-bold text-white text-center leading-tight line-clamp-2">
            {service.name}
          </span>
          <span
            className="text-[9px] font-medium uppercase tracking-wider truncate max-w-full"
            style={{ color: lc.hex }}
          >
            {service.tags[0]}
          </span>
        </div>
      </div>

      {/* Step number badge */}
      {stepNumber !== undefined && (
        <div
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold z-10"
          style={{
            background: isActiveStep ? lc.hex : '#1e293b',
            color: isActiveStep ? '#000' : lc.hex,
            border: `1px solid ${lc.hex}`,
            boxShadow: isActiveStep ? `0 0 8px ${lc.hex}` : 'none',
          }}
        >
          {stepNumber}
        </div>
      )}
    </motion.div>
  );
}
