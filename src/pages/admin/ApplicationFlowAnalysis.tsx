import React from 'react'
import { Container } from '@/components/ui/Container'
import ApplicationFlowAnalyzer from '@/components/admin/ApplicationFlowAnalyzer'
import { TrendingUp, Users, Zap } from 'lucide-react'

export default function ApplicationFlowAnalysis() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <Container size="full">
        <div className="mb-8">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Application Flow Analysis</h1>
              <p className="text-gray-600 mt-1">
                Comprehensive analysis of user journeys, workflow bottlenecks, and automation opportunities
              </p>
            </div>
          </div>

          {/* Key Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-lg p-6 shadow-sm border">
              <div className="flex items-center mb-3">
                <Users className="w-5 h-5 text-blue-600 mr-2" />
                <h3 className="font-semibold text-gray-900">User Journey Mapping</h3>
              </div>
              <p className="text-sm text-gray-600">
                Complete mapping of student application and admin review workflows with touchpoint identification
              </p>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm border">
              <div className="flex items-center mb-3">
                <TrendingUp className="w-5 h-5 text-amber-600 mr-2" />
                <h3 className="font-semibold text-gray-900">Bottleneck Detection</h3>
              </div>
              <p className="text-sm text-gray-600">
                Identify processing delays, quantify user experience impact, and calculate optimization potential
              </p>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm border">
              <div className="flex items-center mb-3">
                <Zap className="w-5 h-5 text-green-600 mr-2" />
                <h3 className="font-semibold text-gray-900">Automation Opportunities</h3>
              </div>
              <p className="text-sm text-gray-600">
                Analyze repetitive tasks and generate automation recommendations with ROI calculations
              </p>
            </div>
          </div>
        </div>

        <ApplicationFlowAnalyzer />
      </Container>
    </div>
  )
}