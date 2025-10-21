import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const stackVariants = cva('flex', {
  variants: {
    direction: {
      vertical: 'flex-col',
      horizontal: 'flex-row',
    },
    spacing: {
      none: 'gap-0',
      xs: 'gap-1',
      sm: 'gap-2',
      md: 'gap-4',
      lg: 'gap-6',
      xl: 'gap-8',
    },
    align: {
      start: 'items-start',
      center: 'items-center',
      end: 'items-end',
      stretch: 'items-stretch',
    },
    justify: {
      start: 'justify-start',
      center: 'justify-center',
      end: 'justify-end',
      between: 'justify-between',
      around: 'justify-around',
    },
  },
  defaultVariants: {
    direction: 'vertical',
    spacing: 'md',
    align: 'stretch',
    justify: 'start',
  },
})

export interface StackProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof stackVariants> {}

export function Stack({ className, direction, spacing, align, justify, ...props }: StackProps) {
  return (
    <div
      className={cn(stackVariants({ direction, spacing, align, justify }), className)}
      {...props}
    />
  )
}
