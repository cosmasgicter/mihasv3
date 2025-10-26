import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const sizeToMaxWidth: Record<string, string> = {
  sm: '48rem', // ~3xl
  md: '64rem', // ~5xl
  lg: '80rem', // use var(--max-content-width) fallback
  xl: '88rem',
  full: '100%'
}

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: keyof typeof sizeToMaxWidth
}

export function Container({ className, size = 'lg', ...props }: ContainerProps) {
  const maxW = size === 'lg' ? 'var(--max-content-width)' : sizeToMaxWidth[size]
  return (
    <div
      className={cn('mx-auto', className)}
      style={{
        maxWidth: maxW,
        paddingLeft: 'var(--content-padding)',
        paddingRight: 'var(--content-padding)'
      }}
      {...props}
    />
  )
}
