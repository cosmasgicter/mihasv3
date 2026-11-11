/**
 * The one status-tone map (platform-simplification task 23.1, Requirement 18.2).
 *
 * Generalises `StatusPill`'s rule: the tone lives in the tint, the border and the
 * icon; the label is `text-foreground` (`text-muted-foreground` for `muted`). A
 * tone-coloured label on its own tint does not clear 4.5:1, so no consumer sets one.
 *
 * Class names are written out in full so Tailwind's scanner sees them.
 */
export type StatusTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'muted' | 'accent'

export interface StatusToneClasses {
  /** Background tint. */
  tint: string
  /** Border colour; empty for `accent`, which has no border (the identity-document tile). */
  border: string
  /** Label colour. */
  text: string
  /** Icon colour: the tone's base colour where it has one, else a token that clears 3:1. */
  icon: string
}

export const STATUS_TONES: Record<StatusTone, StatusToneClasses> = {
  neutral: { tint: 'bg-muted', border: 'border-border/60', text: 'text-foreground', icon: 'text-muted-foreground' },
  info: { tint: 'bg-info/10', border: 'border-info/40', text: 'text-foreground', icon: 'text-info' },
  warning: { tint: 'bg-warning/10', border: 'border-warning/40', text: 'text-foreground', icon: 'text-warning' },
  success: { tint: 'bg-success/10', border: 'border-success/40', text: 'text-foreground', icon: 'text-success' },
  danger: { tint: 'bg-destructive/10', border: 'border-destructive/40', text: 'text-foreground', icon: 'text-destructive' },
  muted: { tint: 'bg-muted/60', border: 'border-border/40', text: 'text-muted-foreground', icon: 'text-muted-foreground' },
  accent: { tint: 'bg-accent/10', border: '', text: 'text-foreground', icon: 'text-accent-foreground' },
}

/** Tint, border and label classes, as one string, for a chip or a pill. */
export function toneSurfaceClasses(tone: StatusTone): string {
  const t = STATUS_TONES[tone]
  return [t.tint, t.text, t.border].filter(Boolean).join(' ')
}
