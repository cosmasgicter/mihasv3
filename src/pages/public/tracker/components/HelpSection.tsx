import React from 'react'
import { Phone, Mail, MapPin, HelpCircle, FileSearch, CheckCircle, Clock, Target, XCircle, Rocket } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'
import { animateClasses } from '@/lib/animations'

export const HelpSection: React.FC = () => {
  return (
    <div className={animateClasses.slideUp} style={{ animationDelay: '300ms', animationFillMode: 'forwards' }}>
      <SectionCard
        title="Need Help?"
        description="Everything you need to know about tracking your application"
        icon={<HelpCircle className="h-5 w-5" />}
        headerVariant="tinted"
      >
        <div className="space-y-6">
          {/* Help Cards Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Where to Find Application Number */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 rounded-lg bg-primary/10">
                  <FileSearch className="h-5 w-5 text-primary" />
                </div>
                <h4 className="font-semibold text-gray-900 text-base">
                  Where to find your application number?
                </h4>
              </div>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>Check your email confirmation after submitting</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>Look for format: <code className="bg-primary/10 px-1.5 py-0.5 rounded font-mono text-xs">MIHAS123456</code></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>Contact admissions if you can't find it</span>
                </li>
              </ul>
            </div>
            
            {/* Status Meanings */}
            <div className="rounded-xl border border-warning/20 bg-warning/5 p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 rounded-lg bg-warning/10">
                  <Target className="h-5 w-5 text-warning" />
                </div>
                <h4 className="font-semibold text-gray-900 text-base">
                  Application Status Meanings
                </h4>
              </div>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <Rocket className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                  <span><strong>Submitted:</strong> Application received and queued</span>
                </li>
                <li className="flex items-start gap-2">
                  <Clock className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                  <span><strong>Under Review:</strong> Being carefully evaluated</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
                  <span><strong>Approved:</strong> Congratulations! You're accepted</span>
                </li>
                <li className="flex items-start gap-2">
                  <XCircle className="h-4 w-4 text-error flex-shrink-0 mt-0.5" />
                  <span><strong>Rejected:</strong> Not accepted this time</span>
                </li>
              </ul>
            </div>
          </div>
          
          {/* Contact Information */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Phone className="h-5 w-5 text-secondary" />
              <Mail className="h-5 w-5 text-primary" />
              <MapPin className="h-5 w-5 text-secondary" />
            </div>
            
            <h4 className="text-center text-lg font-semibold text-gray-900 mb-4">
              Contact Information
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-muted/50 rounded-lg p-4 text-center">
                <p className="font-semibold text-gray-900 mb-2 flex items-center justify-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  Email Support
                </p>
                <a href="mailto:info@mihas.edu.zm" className="text-primary font-medium hover:underline text-sm">
                  info@mihas.edu.zm
                </a>
              </div>
              
              <div className="bg-muted/50 rounded-lg p-4 text-center">
                <p className="font-semibold text-gray-900 mb-2 flex items-center justify-center gap-2">
                  <Phone className="h-4 w-4 text-secondary" />
                  Phone Support
                </p>
                <div className="space-y-1 text-sm">
                  <p><strong>KATC:</strong> <a href="tel:0966992299" className="text-primary hover:underline">0966992299</a></p>
                  <p><strong>MIHAS:</strong> <a href="tel:0961515151" className="text-primary hover:underline">0961515151</a></p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
