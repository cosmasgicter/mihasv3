import { type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { badgeVariants } from '@/design-system/variants'

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}
