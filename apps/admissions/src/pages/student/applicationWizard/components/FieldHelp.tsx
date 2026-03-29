import { HelpCircle } from 'lucide-react'
import { TooltipRoot, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface FieldHelpProps {
  title: string
  description: string
  example?: string
}

export const FieldHelp = ({ title, description, example }: FieldHelpProps) => {
  return (
    <TooltipProvider delayDuration={200}>
      <TooltipRoot>
        <TooltipTrigger type="button" className="inline-flex items-center">
          <HelpCircle className="h-4 w-4 text-caption hover:text-primary transition-colors" />
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-semibold">{title}</p>
            <p className="text-xs text-primary-foreground/90">{description}</p>
            {example && (
              <p className="text-xs text-primary-foreground/70 italic">
                Example: {example}
              </p>
            )}
          </div>
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  )
}
