'use client';

import { motion } from 'framer-motion';

interface WaveDividerProps {
  /** Glow green when both adjacent columns are part of the active workflow */
  isActive: boolean;
}

export default function WaveDivider({ isActive }: WaveDividerProps) {
  return (
    <div className="relative shrink-0 w-6 self-stretch overflow-hidden">
      <svg
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="none"
        viewBox="0 0 24 800"
        xmlns="http://www.w3.org/2000/svg"
      >
        <motion.path
          d={[
            'M 12 0',
            'C 20 50, 4 50, 12 100',
            'C 20 150, 4 150, 12 200',
            'C 20 250, 4 250, 12 300',
            'C 20 350, 4 350, 12 400',
            'C 20 450, 4 450, 12 500',
            'C 20 550, 4 550, 12 600',
            'C 20 650, 4 650, 12 700',
            'C 20 750, 4 750, 12 800',
          ].join(' ')}
          fill="none"
          strokeLinecap="round"
          animate={{
            stroke: isActive ? '#76b900' : '#1e293b',
            strokeWidth: isActive ? 2 : 1,
            filter: isActive
              ? 'drop-shadow(0 0 4px #76b900) drop-shadow(0 0 8px #76b90060)'
              : 'none',
          }}
          transition={{ duration: 0.4 }}
        />
      </svg>
    </div>
  );
}
