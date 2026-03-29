import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const sectionVariants = cva('w-full', {
  variants: {
    spacing: {
      none: 'py-0',
      sm: 'py-8',
      md: 'py-12',
      lg: 'py-16',
      xl: 'py-24',
    },
    background: {
      default: 'bg-background',
      muted: 'bg-secondary/5',
      primary: 'bg-primary/5',
      gradient: 'bg-gradient-to-b from-background to-primary/5',
    },
  },
  defaultVariants: {
    spacing: 'md',
    background: 'default',
  },
})

export interface SectionProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof sectionVariants> {}

export function Section({ className, spacing, background, ...props }: SectionProps) {
  return (
    <section
      className={cn(sectionVariants({ spacing, background }), className)}
      {...props}
    />
  )
}
