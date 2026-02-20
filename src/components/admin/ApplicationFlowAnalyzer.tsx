import React, { useState, useEffect } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { 
  UserJourneyMapper, 
  BottleneckDetectionEngine, 
  AutomationOpportunityIdentifier,
  type UserJourney,
  type BottleneckMetrics,
  type AutomationOpportunity,
  type WorkflowAutomationRecommendation
} from '@/lib/applicationFlowAnalyzer'
import {
  Users,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  BarChart3,
  Zap,
  Target,
  DollarSign,
  Calendar,
  FileText
} from 'lucide-react'

interface ApplicationFlowAnalyzerProps {
  className?: string
}

export function ApplicationFlowAnalyzer({ className = '' }: ApplicationFlowAnalyzerProps) {
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'journeys' | 'bottlenecks' | 'automation'>('journeys')
  
  // Data state
  const [studentJourney, setStudentJourney] = useState<UserJourney | null>(null)
  const [adminJourney, setAdminJourney] = useState<UserJourney | null>(null)
  const [bottlenecks, setBottlenecks] = useState<BottleneckMetrics[]>([])
  const [automationOpportunities, setAutomationOpportunities] = useState<AutomationOpportunity[]>([])
  const [workflowRecommendations, setWorkflowRecommendations] = useState<WorkflowAutomationRecommendation[]>([])

  useEffect(() => {
    initializeAnalysis()
  }, [])

  const initializeAnalysis = async () => {
    try {
      setLoading(true)

      // Initialize analyzers
      const journeyMapper = new UserJourneyMapper()
      const bottleneckEngine = new BottleneckDetectionEngine()
      const automationIdentifier = new AutomationOpportunityIdentifier()

      // Get journey data
      const studentJourneyData = journeyMapper.getStudentApplicationJourney()
      const adminJourneyData = journeyMapper.getAdminReviewJourney()

      // Analyze bottlenecks
      const studentBottlenecks = await bottleneckEngine.analyzeProcessingTimes('student_application')
      const adminBottlenecks = await bottleneckEngine.analyzeProcessingTimes('admin_review')
      const allBottlenecks = [...studentBottlenecks, ...adminBottlenecks]

      // Identify automation opportunities
      const repetitiveTasks = automationIdentifier.analyzeRepetitiveTasks()
      const opportunities = automationIdentifier.generateAutomationRecommendations(repetitiveTasks)
      const recommendations = automationIdentifier.generateWorkflowRecommendations(opportunities)

      // Update state
      setStudentJourney(studentJourneyData)
      setAdminJourney(adminJourneyData)
      setBottlenecks(allBottlenecks)
      setAutomationOpportunities(opportunities)
      setWorkflowRecommendations(recommendations)

    } catch (error) {
      console.error('Error initializing flow analysis:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner size="lg" />
        <span className="ml-3 text-muted-foreground">Analyzing application workflows...</span>
      </div>
    )
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Application Flow Analysis</h2>
          <p className="text-muted-foreground mt-1">
            Comprehensive analysis of user journeys, bottlenecks, and automation opportunities
          </p>
        </div>
        <Button onClick={initializeAnalysis} variant="outline">
          <TrendingUp className="w-4 h-4 mr-2" />
          Refresh Analysis
        </Button>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'journeys', label: 'User Journeys', icon: Users },
            { id: 'bottlenecks', label: 'Bottlenecks', icon: AlertTriangle },
            { id: 'automation', label: 'Automation', icon: Zap }
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-muted-foreground hover:text-muted-foreground hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4 mr-2" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'journeys' && (
        <JourneyAnalysisTab 
          studentJourney={studentJourney}
          adminJourney={adminJourney}
        />
      )}

      {activeTab === 'bottlenecks' && (
        <BottleneckAnalysisTab 
          bottlenecks={bottlenecks}
        />
      )}

      {activeTab === 'automation' && (
        <AutomationAnalysisTab 
          opportunities={automationOpportunities}
          recommendations={workflowRecommendations}
        />
      )}
    </div>
  )
}

function JourneyAnalysisTab({ 
  studentJourney, 
  adminJourney 
}: { 
  studentJourney: UserJourney | null
  adminJourney: UserJourney | null 
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Student Journey */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Student Application Journey</h3>
          <div className="flex items-center text-sm text-muted-foreground">
            <Clock className="w-4 h-4 mr-1" />
            {studentJourney?.totalEstimatedTime} min total
          </div>
        </div>

        {studentJourney && (
          <div className="space-y-4">
            {/* Journey Overview */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-blue-50 rounded-lg">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{studentJourney.steps.length}</div>
                <div className="text-sm text-muted-foreground">Steps</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{studentJourney.bottlenecks.length}</div>
                <div className="text-sm text-muted-foreground">Bottlenecks</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {studentJourney.steps.filter(s => s.automationPotential === 'high').length}
                </div>
                <div className="text-sm text-muted-foreground">High Auto Potential</div>
              </div>
            </div>

            {/* Journey Steps */}
            <div className="space-y-3">
              {studentJourney.steps.map((step, index) => (
                <div key={step.id} className="flex items-center p-3 border rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-sm font-medium text-blue-600">
                    {index + 1}
                  </div>
                  <div className="ml-3 flex-1">
                    <div className="text-sm font-medium text-foreground">{step.name}</div>
                    <div className="text-xs text-muted-foreground">{step.description}</div>
                  </div>
                  <div className="flex items-center space-x-2 text-xs">
                    <span className="text-muted-foreground">{step.estimatedDuration}m</span>
                    {step.automationPotential === 'high' && (
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded">High Auto</span>
                    )}
                    {studentJourney.bottlenecks.includes(step.id) && (
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Admin Journey */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Admin Review Journey</h3>
          <div className="flex items-center text-sm text-muted-foreground">
            <Clock className="w-4 h-4 mr-1" />
            {adminJourney?.totalEstimatedTime} min total
          </div>
        </div>

        {adminJourney && (
          <div className="space-y-4">
            {/* Journey Overview */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-purple-50 rounded-lg">
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{adminJourney.steps.length}</div>
                <div className="text-sm text-muted-foreground">Steps</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{adminJourney.bottlenecks.length}</div>
                <div className="text-sm text-muted-foreground">Bottlenecks</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {adminJourney.steps.filter(s => s.automationPotential === 'high').length}
                </div>
                <div className="text-sm text-muted-foreground">High Auto Potential</div>
              </div>
            </div>

            {/* Journey Steps */}
            <div className="space-y-3">
              {adminJourney.steps.map((step, index) => (
                <div key={step.id} className="flex items-center p-3 border rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-sm font-medium text-purple-600">
                    {index + 1}
                  </div>
                  <div className="ml-3 flex-1">
                    <div className="text-sm font-medium text-foreground">{step.name}</div>
                    <div className="text-xs text-muted-foreground">{step.description}</div>
                  </div>
                  <div className="flex items-center space-x-2 text-xs">
                    <span className="text-muted-foreground">{step.estimatedDuration}m</span>
                    {step.automationPotential === 'high' && (
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded">High Auto</span>
                    )}
                    {adminJourney.bottlenecks.includes(step.id) && (
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

function BottleneckAnalysisTab({ bottlenecks }: { bottlenecks: BottleneckMetrics[] }) {
  const topBottlenecks = bottlenecks.slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Bottleneck Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
            <div className="ml-3">
              <div className="text-2xl font-bold text-foreground">{bottlenecks.length}</div>
              <div className="text-sm text-muted-foreground">Total Bottlenecks</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center">
            <Clock className="w-8 h-8 text-blue-500" />
            <div className="ml-3">
              <div className="text-2xl font-bold text-foreground">
                {bottlenecks.reduce((sum, b) => sum + b.averageProcessingTime, 0).toFixed(0)}m
              </div>
              <div className="text-sm text-muted-foreground">Total Processing Time</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center">
            <TrendingUp className="w-8 h-8 text-green-500" />
            <div className="ml-3">
              <div className="text-2xl font-bold text-foreground">
                {Math.round(bottlenecks.reduce((sum, b) => sum + b.optimizationPotential, 0) / bottlenecks.length)}%
              </div>
              <div className="text-sm text-muted-foreground">Avg Optimization Potential</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center">
            <BarChart3 className="w-8 h-8 text-purple-500" />
            <div className="ml-3">
              <div className="text-2xl font-bold text-foreground">
                {bottlenecks.filter(b => b.userExperienceImpact === 'high').length}
              </div>
              <div className="text-sm text-muted-foreground">High UX Impact</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Top Bottlenecks */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Top Bottlenecks by Optimization Potential</h3>
        <div className="space-y-4">
          {topBottlenecks.map((bottleneck, index) => (
            <div key={bottleneck.stepId} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center">
                  <div className="flex-shrink-0 w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-sm font-medium text-red-600">
                    {index + 1}
                  </div>
                  <div className="ml-3">
                    <div className="text-sm font-medium text-foreground">{bottleneck.stepName}</div>
                    <div className="text-xs text-muted-foreground">Step ID: {bottleneck.stepId}</div>
                  </div>
                </div>
                <div className="flex items-center space-x-4 text-sm">
                  <div className="text-center">
                    <div className="font-medium text-foreground">{bottleneck.averageProcessingTime.toFixed(1)}m</div>
                    <div className="text-xs text-muted-foreground">Avg Time</div>
                  </div>
                  <div className="text-center">
                    <div className="font-medium text-foreground">{bottleneck.errorRate.toFixed(1)}%</div>
                    <div className="text-xs text-muted-foreground">Error Rate</div>
                  </div>
                  <div className="text-center">
                    <div className="font-medium text-foreground">{bottleneck.optimizationPotential}%</div>
                    <div className="text-xs text-muted-foreground">Optimization</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Throughput:</span>
                  <span className="ml-1 font-medium">{bottleneck.throughputPerHour.toFixed(1)}/hr</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Queue Length:</span>
                  <span className="ml-1 font-medium">{bottleneck.queueLength}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">UX Impact:</span>
                  <span className={`ml-1 font-medium ${
                    bottleneck.userExperienceImpact === 'high' ? 'text-red-600' :
                    bottleneck.userExperienceImpact === 'medium' ? 'text-amber-600' : 'text-green-600'
                  }`}>
                    {bottleneck.userExperienceImpact}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Std Dev:</span>
                  <span className="ml-1 font-medium">{bottleneck.standardDeviation.toFixed(1)}m</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function AutomationAnalysisTab({ 
  opportunities, 
  recommendations 
}: { 
  opportunities: AutomationOpportunity[]
  recommendations: WorkflowAutomationRecommendation[]
}) {
  const topOpportunities = opportunities.slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Automation Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center">
            <Zap className="w-8 h-8 text-yellow-500" />
            <div className="ml-3">
              <div className="text-2xl font-bold text-foreground">{opportunities.length}</div>
              <div className="text-sm text-muted-foreground">Automation Opportunities</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center">
            <DollarSign className="w-8 h-8 text-green-500" />
            <div className="ml-3">
              <div className="text-2xl font-bold text-foreground">
                K{opportunities.reduce((sum, o) => sum + o.roi.monthlySavings, 0).toFixed(0)}
              </div>
              <div className="text-sm text-muted-foreground">Monthly Savings Potential</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center">
            <Target className="w-8 h-8 text-blue-500" />
            <div className="ml-3">
              <div className="text-2xl font-bold text-foreground">
                {Math.round(opportunities.reduce((sum, o) => sum + o.roi.annualROI, 0) / opportunities.length)}%
              </div>
              <div className="text-sm text-muted-foreground">Average ROI</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center">
            <Calendar className="w-8 h-8 text-purple-500" />
            <div className="ml-3">
              <div className="text-2xl font-bold text-foreground">
                {Math.round(opportunities.reduce((sum, o) => sum + o.roi.paybackPeriod, 0) / opportunities.length)}
              </div>
              <div className="text-sm text-muted-foreground">Avg Payback (months)</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Top Opportunities */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Top Automation Opportunities</h3>
        <div className="space-y-4">
          {topOpportunities.map((opportunity, index) => (
            <div key={opportunity.taskId} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center">
                  <div className="flex-shrink-0 w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center text-sm font-medium text-yellow-600">
                    {index + 1}
                  </div>
                  <div className="ml-3">
                    <div className="text-sm font-medium text-foreground">{opportunity.taskName}</div>
                    <div className="text-xs text-muted-foreground">{opportunity.automationPattern.name}</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    opportunity.priority === 'high' ? 'bg-red-100 text-red-700' :
                    opportunity.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {opportunity.priority} priority
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Monthly Savings:</span>
                  <span className="ml-1 font-medium text-green-600">K{opportunity.roi.monthlySavings.toFixed(0)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">ROI:</span>
                  <span className="ml-1 font-medium text-blue-600">{opportunity.roi.annualROI.toFixed(0)}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Implementation:</span>
                  <span className="ml-1 font-medium">{opportunity.implementationApproach.estimatedEffort} days</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Payback:</span>
                  <span className="ml-1 font-medium">{opportunity.roi.paybackPeriod.toFixed(1)} months</span>
                </div>
              </div>

              <div className="mt-3 text-sm text-muted-foreground">
                <span className="font-medium">Technology:</span> {opportunity.implementationApproach.technology}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Workflow Recommendations */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Workflow Automation Recommendations</h3>
        <div className="space-y-4">
          {recommendations.map((recommendation, index) => (
            <div key={recommendation.id} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-medium text-foreground">{recommendation.title}</div>
                  <div className="text-xs text-muted-foreground">{recommendation.description}</div>
                </div>
                <div className="text-right text-sm">
                  <div className="font-medium text-foreground">{recommendation.implementationPlan.totalDuration} weeks</div>
                  <div className="text-xs text-muted-foreground">Implementation</div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                <div>
                  <span className="text-muted-foreground">Efficiency:</span>
                  <span className="ml-1 font-medium text-green-600">+{recommendation.businessImpact.efficiency}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Accuracy:</span>
                  <span className="ml-1 font-medium text-blue-600">{recommendation.businessImpact.accuracy.toFixed(0)}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Cost Reduction:</span>
                  <span className="ml-1 font-medium text-purple-600">{recommendation.businessImpact.costReduction.toFixed(0)}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">User Satisfaction:</span>
                  <span className="ml-1 font-medium text-indigo-600">+{recommendation.businessImpact.userSatisfaction}%</span>
                </div>
              </div>

              <div className="text-sm text-muted-foreground">
                <span className="font-medium">Target Tasks:</span> {recommendation.targetTasks.join(', ')}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

export default ApplicationFlowAnalyzer