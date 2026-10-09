import React from 'react'
import { Link } from 'react-router-dom'
import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/Button'

/**
 * The foot of a resolved tracking result: how to see the whole application.
 *
 * Admissions-v2 task 11.5 (R16.5, MAINT-02) removed two things from this strip.
 *
 * **The second "Need Help?" block.** It carried the heading "Need Help?" and the
 * sentence "Contact our admissions office for assistance and support" — no
 * address, no route, no affordance of any kind — directly above `HelpSection`,
 * which is the panel that actually answers it and now resolves a real support
 * contact from tenant context. Two help headings on one page, one of which could
 * not help.
 *
 * **The `Rocket` icon on "Create Account".** Decoration standing in for meaning
 * on a control whose consequence is an account (R16.4's restraint, and the
 * `PRODUCT.md` rule that icons carry meaning). The two commands are now
 * distinguished by their labels, and only the one that leads somewhere specific
 * keeps an icon.
 *
 * Both remaining controls are `Button asChild` over a router `Link` — the repo
 * convention for a semantic link — rather than a `Button` nested inside a `Link`,
 * which produced an anchor wrapping a button and two focus stops for one target.
 */
export const ApplicationActions: React.FC = () => {
  return (
    <div className="border-t border-border bg-muted/30 p-6 sm:p-8">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button asChild variant="outline" size="lg" className="min-h-touch w-full justify-center sm:w-auto">
          <Link to="/auth/signup">Create account</Link>
        </Button>
        <Button asChild size="lg" className="min-h-touch w-full justify-center gap-2 sm:w-auto">
          <Link to="/auth/signin">
            <Eye className="h-5 w-5" aria-hidden="true" />
            <span>Sign in for full details</span>
          </Link>
        </Button>
      </div>
    </div>
  )
}
