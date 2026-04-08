/**
 * InfiniteGrid Component - Pure CSS/SVG animated grid background
 * Renders a subtle diagonal-scrolling grid pattern as a positioned background layer.
 * No canvas, WebGL, or framer-motion — uses CSS @keyframes on an SVG pattern.
 *
 * @requirements 1.1 - Animated infinite grid background on landing page
 * @requirements 1.2 - Maintain 30fps on mobile (pure CSS, no JS animation loop)
 * @requirements 1.3 - CSS/SVG rendering, no WebGL or canvas
 * @requirements 1.4 - prefers-reduced-motion renders static grid
 */

import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/animation-config';

interface InfiniteGridProps {
  /** Grid cell size in pixels (default: 40) */
  cellSize?: number;
  /** Grid line color (default: uses Tailwind border token) */
  lineColor?: string;
  /** Grid line opacity (default: 0.15) */
  lineOpacity?: number;
  /** Animation speed multiplier (default: 1) */
  speed?: number;
  /** Additional className */
  className?: string;
}

export function InfiniteGrid({
  cellSize = 40,
  lineColor,
  lineOpacity = 0.15,
  speed = 1,
  className,
}: InfiniteGridProps) {
  const reducedMotion = useReducedMotion();

  // Duration inversely proportional to speed — faster speed = shorter duration
  const duration = speed > 0 ? 20 / speed : 20;

  // Resolve line color: default to a neutral border color if not provided
  const resolvedColor = lineColor || 'currentColor';

  const patternId = 'infinite-grid-pattern';

  return (
    <div
      className={cn('absolute inset-0 z-0 overflow-hidden', className)}
      aria-hidden="true"
    >
      <style>{`
        @keyframes infinite-grid-scroll {
          from { transform: translate(0, 0); }
          to { transform: translate(-${cellSize}px, -${cellSize}px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .infinite-grid-animated { animation: none !important; }
        }
      `}</style>
      <svg
        className={cn(
          'w-[calc(100%+var(--grid-cell))] h-[calc(100%+var(--grid-cell))]',
          !reducedMotion && 'infinite-grid-animated'
        )}
        style={{
          ['--grid-cell' as string]: `${cellSize}px`,
          ...(reducedMotion
            ? {}
            : {
                animation: `infinite-grid-scroll ${duration}s linear infinite`,
              }),
        }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id={patternId}
            width={cellSize}
            height={cellSize}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${cellSize} 0 L 0 0 0 ${cellSize}`}
              fill="none"
              stroke={resolvedColor}
              strokeOpacity={lineOpacity}
              strokeWidth={1}
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
    </div>
  );
}

export default InfiniteGrid;
