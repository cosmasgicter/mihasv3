import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Phone, Mail, MapPin } from 'lucide-react'
import { AnimatedCard } from '@/components/ui/AnimatedCard'

export const HelpSection: React.FC = () => {
  const shouldReduceMotion = useReducedMotion()
  const maybeMotion = <T,>(value: T) => (shouldReduceMotion ? undefined : value)

  return (
    <motion.div
      initial={maybeMotion({ opacity: 0, y: 30 })}
      animate={maybeMotion({ opacity: 1, y: 0 })}
      transition={maybeMotion({ delay: 1.2 })}
      className="mt-16"
    >
      <AnimatedCard glassEffect>
        <div className="text-center mb-12">
          <h3 className="text-4xl font-black text-body mb-4 flex items-center justify-center space-x-3">
            <span>❓</span>
            <span>Need Help?</span>
          </h3>
          <p className="text-xl text-gray-800 font-medium">Everything you need to know about tracking your application</p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          <AnimatedCard className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200" hover3d>
            <div className="text-center space-y-4">
              <div className="text-5xl">📍</div>
              <h4 className="font-black text-body text-2xl">
                Where to find your application number?
              </h4>
              <ul className="text-gray-800 space-y-3 text-lg text-left">
                <li className="flex items-start space-x-3">
                  <span className="text-blue-600 font-bold text-xl">•</span>
                  <span className="font-medium">Check your email confirmation after submitting</span>
                </li>
                <li className="flex items-start space-x-3">
                  <span className="text-blue-600 font-bold text-xl">•</span>
                  <span className="font-medium">Look for format: <code className="bg-blue-100 px-2 py-1 rounded font-mono font-bold text-gray-900">MIHAS123456</code></span>
                </li>
                <li className="flex items-start space-x-3">
                  <span className="text-blue-600 font-bold text-xl">•</span>
                  <span className="font-medium">Contact admissions if you can't find it</span>
                </li>
              </ul>
            </div>
          </AnimatedCard>
          
          <AnimatedCard className="bg-gradient-to-br from-green-50 to-emerald-50 border border-yellow-200" hover3d delay={0.1}>
            <div className="text-center space-y-4">
              <div className="text-5xl">📊</div>
              <h4 className="font-black text-body text-2xl">
                Application Status Meanings
              </h4>
              <ul className="text-gray-800 space-y-3 text-lg text-left">
                <li className="flex items-start space-x-3">
                  <span className="text-2xl">🚀</span>
                  <div className="font-medium">
                    <strong className="text-gray-900">Submitted:</strong> Application received and queued
                  </div>
                </li>
                <li className="flex items-start space-x-3">
                  <span className="text-2xl">🔍</span>
                  <div className="font-medium">
                    <strong className="text-gray-900">Under Review:</strong> Being carefully evaluated
                  </div>
                </li>
                <li className="flex items-start space-x-3">
                  <span className="text-2xl">🎉</span>
                  <div className="font-medium">
                    <strong className="text-gray-900">Approved:</strong> Congratulations! You're accepted
                  </div>
                </li>
                <li className="flex items-start space-x-3">
                  <span className="text-2xl">💔</span>
                  <div className="font-medium">
                    <strong className="text-gray-900">Rejected:</strong> Not accepted this time
                  </div>
                </li>
              </ul>
            </div>
          </AnimatedCard>
        </div>
        
        <AnimatedCard className="bg-gradient-to-r from-purple-50 via-blue-50 to-indigo-50 border-2 border-gray-200" delay={0.2}>
          <div className="text-center space-y-6">
            <div className="flex items-center justify-center space-x-4">
              <Phone className="h-8 w-8 text-secondary" />
              <Mail className="h-8 w-8 text-primary" />
              <MapPin className="h-8 w-8 text-secondary" />
            </div>
            
            <h4 className="text-3xl font-black text-body">
              📞 Contact Information
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-lg">
              <div className="bg-white/80 rounded-xl p-6 border border-purple-200">
                <p className="font-bold text-gray-900 mb-2 text-xl">📧 Email Support</p>
                <a href="mailto:info@mihas.edu.zm" className="text-blue-700 font-bold hover:underline text-lg">
                  info@mihas.edu.zm
                </a>
              </div>
              
              <div className="bg-white/80 rounded-xl p-6 border border-purple-200">
                <p className="font-bold text-gray-900 mb-2 text-xl">📱 Phone Support</p>
                <div className="space-y-1 text-gray-800 font-medium">
                  <p><strong className="text-gray-900">KATC:</strong> <a href="tel:0966992299" className="text-blue-700 font-bold hover:underline">0966992299</a></p>
                  <p><strong className="text-gray-900">MIHAS:</strong> <a href="tel:0961515151" className="text-blue-700 font-bold hover:underline">0961515151</a></p>
                </div>
              </div>
            </div>
          </div>
        </AnimatedCard>
      </AnimatedCard>
    </motion.div>
  )
}
