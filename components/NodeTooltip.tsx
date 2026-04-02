'use client';

/**
 * NodeTooltip — game HUD style tooltip shown on node hover
 *
 * Renders as a fixed overlay near the cursor. Styled like an RPG item tooltip:
 * dark glass panel, NVIDIA green border, corner bracket accents, scanline divider.
 */

import { motion } from 'framer-motion';
import { ExternalLink } from 'lucide-react';
import { LAYER_LABELS, type Service } from '@/types/ecosystem';

interface NodeTooltipProps {
  service: Service;
  /** Cursor X in viewport coordinates */
  x: number;
  /** Cursor Y in viewport coordinates */
  y: number;
}

const TOOLTIP_W = 276;

export default function NodeTooltip({ service, x, y }: NodeTooltipProps) {
  // Flip horizontally if too close to right edge
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
  const flipX = x + 20 + TOOLTIP_W > vw;
  const left  = flipX ? x - TOOLTIP_W - 12 : x + 20;

  // Estimated height ~180px; flip up if near bottom
  const flipY = y + 200 > vh;
  const top   = flipY ? y - 190 : y - 12;

  return (
    <motion.div
      key={service.id}
      initial={{ opacity: 0, scale: 0.94, y: flipY ? 6 : -6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.1, ease: 'easeOut' }}
      className="fixed z-[9999] pointer-events-none select-none"
      style={{ left, top, width: TOOLTIP_W }}
    >
      <div
        className="relative overflow-hidden"
        style={{
          background:   'rgba(5, 5, 5, 0.97)',
          border:       '1px solid #76b900',
          borderRadius: 3,
          boxShadow:    '0 0 0 1px #76b90020, 0 0 24px #76b90020, 0 12px 40px rgba(0,0,0,0.95)',
        }}
      >
        {/* Subtle scanline overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(118,185,0,0.018) 3px, rgba(118,185,0,0.018) 4px)',
          }}
        />

        {/* Corner brackets */}
        {[
          'top-0 left-0 border-t-2 border-l-2 -translate-x-px -translate-y-px',
          'top-0 right-0 border-t-2 border-r-2  translate-x-px -translate-y-px',
          'bottom-0 left-0 border-b-2 border-l-2 -translate-x-px  translate-y-px',
          'bottom-0 right-0 border-b-2 border-r-2  translate-x-px  translate-y-px',
        ].map((cls, i) => (
          <div
            key={i}
            className={`absolute w-2.5 h-2.5 border-[#76b900] ${cls}`}
          />
        ))}

        <div className="relative p-3.5 space-y-2.5">
          {/* Layer badge + name */}
          <div>
            <span
              className="inline-block text-[8px] font-bold uppercase tracking-[0.18em] px-1.5 py-0.5 rounded-sm mb-1.5"
              style={{
                background: '#76b90018',
                color:      '#76b900',
                border:     '1px solid #76b90035',
              }}
            >
              {LAYER_LABELS[service.layer]}
            </span>
            <p className="text-white font-bold text-[13px] leading-tight tracking-wide">
              {service.name}
            </p>
          </div>

          {/* Green scanline divider */}
          <div
            className="h-px"
            style={{
              background: 'linear-gradient(90deg, #76b900 0%, #76b90050 60%, transparent 100%)',
            }}
          />

          {/* Description */}
          <p className="text-slate-300 text-[11px] leading-relaxed">
            {service.shortDescription}
          </p>

          {/* Tags */}
          <div className="flex flex-wrap gap-1">
            {service.tags.slice(0, 5).map((tag) => (
              <span
                key={tag}
                className="text-[8px] font-mono px-1.5 py-0.5 rounded-sm"
                style={{
                  background: '#76b90010',
                  color:      '#76b90088',
                  border:     '1px solid #76b90025',
                }}
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Footer hint */}
          <div
            className="flex items-center gap-1 pt-0.5"
            style={{ color: '#76b90055' }}
          >
            <ExternalLink size={8} />
            <span className="text-[8px] font-mono tracking-wide">
              click to open official docs
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
