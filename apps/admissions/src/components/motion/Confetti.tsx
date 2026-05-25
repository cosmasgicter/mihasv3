import { useState, useCallback, useEffect, useMemo } from 'react';
import { useReducedMotion } from '@/lib/animation-config';

const PARTICLE_COUNT = 20;
const DURATION = 2500;
const COLORS = ['#0d9488', '#14b8a6', '#2dd4bf', '#5eead4', '#99f6e4'];

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function ConfettiOverlay({ active }: { active: boolean }) {
  const reduced = useReducedMotion();
  if (reduced || !active) return null;

  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        id: i,
        left: `${randomBetween(5, 95)}%`,
        color: COLORS[i % COLORS.length],
        delay: `${randomBetween(0, 0.5)}s`,
        drift: randomBetween(-40, 40),
        rotation: randomBetween(0, 360),
      })),
    []
  );

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      {particles.map((p) => (
        <span
          key={p.id}
          className="confetti-particle"
          style={{
            left: p.left,
            backgroundColor: p.color,
            animationDelay: p.delay,
            '--drift': `${p.drift}px`,
            '--rotation': `${p.rotation}deg`,
          } as React.CSSProperties}
        />
      ))}
      <style>{`
        .confetti-particle {
          position: absolute;
          top: -10px;
          width: 8px;
          height: 8px;
          border-radius: 2px;
          animation: confetti-fall 2.5s ease-out forwards;
        }
        @keyframes confetti-fall {
          to {
            transform: translateY(100vh) translateX(var(--drift)) rotate(var(--rotation));
            opacity: 0;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .confetti-particle { animation: none; display: none; }
        }
      `}</style>
    </div>
  );
}

export function useConfetti() {
  const [active, setActive] = useState(false);

  const trigger = useCallback(() => {
    setActive(true);
  }, []);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setActive(false), DURATION);
    return () => clearTimeout(timer);
  }, [active]);

  const Overlay = useCallback(() => <ConfettiOverlay active={active} />, [active]);

  return { trigger, ConfettiOverlay: Overlay };
}
