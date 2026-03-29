import { FileText, User, GraduationCap, CreditCard } from 'lucide-react'
import type { UseFormReturn } from 'react-hook-form'
import { animateClasses } from '@/lib/animations'
import type { ApplicationFormData } from '../types'

interface ApplicationPreviewProps {
  form: UseFormReturn<ApplicationFormData>
  programName?: string
  intakeName?: string
}

export const ApplicationPreview = ({ form, programName, intakeName }: ApplicationPreviewProps) => {
  const values = form.watch()
  const isPayLater = values.payment_option === 'pay_later'

  return (
    <div
      className={`bg-card border border-border rounded-lg p-4 space-y-4 ${animateClasses.slideUp}`}
    >
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <FileText className="h-4 w-4" />
        Application Preview
      </h3>

      <div className="space-y-3 text-xs">
        <div className="flex items-start gap-2">
          <User className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground">Personal Info</p>
            <p className="text-caption truncate">{values.full_name || 'Not provided'}</p>
            <p className="text-caption truncate">{values.email || 'Not provided'}</p>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <GraduationCap className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground">Program</p>
            <p className="text-caption truncate">{programName || 'Not selected'}</p>
            <p className="text-caption truncate">{intakeName || 'Not selected'}</p>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <CreditCard className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground">Payment</p>
            {isPayLater ? (
              <>
                <p className="text-caption truncate">Pay later selected</p>
                <p className="text-caption truncate">Complete payment from your dashboard</p>
              </>
            ) : (
              <>
                <p className="text-caption truncate">
                  {values.payment_method || 'Not provided'}
                </p>
                <p className="text-caption truncate">
                  Ref: {values.momo_ref || 'Not provided'}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
