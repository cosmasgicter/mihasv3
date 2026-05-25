import { motion } from 'framer-motion';
import { useReducedMotion } from '@/lib/animation-config';

interface CelebrationPulseProps {
  active: boolean;
  color?: string;
}

export function CelebrationPulse({ active, color = 'var(--color-celebration)' }: CelebrationPulseProps) {
  const reduced = useReducedMotion();
  if (reduced || !active) return null;

  return (
    <motion.span
      className="absolute inset-0 rounded-full pointer-events-none"
      style={{ border: `2px solid ${color}` }}
      initial={{ scale: 0.5, opacity: 1 }}
      animate={{ scale: 1.5, opacity: 0 }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
    />
  );
}
