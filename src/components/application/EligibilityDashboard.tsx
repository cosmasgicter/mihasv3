// @ts-nocheck
import React, { useCallback, useEffect, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts'
import { TrendingUp, Users, CheckCircle, Target } from 'lucide-react'

import {
  DashboardEligibilityAssessment,
  EligibilityAssessmentWithProgram
} from '@/types/eligibility'
import { MissingRequirement } from '@/lib/eligibilityEngine'
import { apiClient } from '@/services/client'
import { catalogService } from '@/services/catalog'
import type { EligibilityAssessment } from '@/types/eligibilityAssessment'

function parseMissingRequirements(
  value: EligibilityAssessmentWithProgram['missing_requirements']
): MissingRequirement[] {
  if (Array.isArray(value)) {
    return value
  }

  try {
    const parsed = JSON.parse(value ?? '[]') as MissingRequirement[]
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    return []
  }
}

function normalizeAssessments(
  assessments: EligibilityAssessmentWithProgram[]
): DashboardEligibilityAssessment[] {
  return assessments.map(assessment => ({
    id: assessment.id,
    application_id: assessment.application_id,
    program_id: assessment.program_id,
    overall_score: assessment.overall_score,
    eligibility_status: assessment.eligibility_status,
    missing_requirements: parseMissingRequirements(assessment.missing_requirements),
    programs: assessment.programs ?? null
  }))
}

interface EligibilityMetrics {
  totalApplications: number
  eligibleCount: number
  conditionalCount: number
  notEligibleCount: number
  averageScore: number
  programBreakdown: Array<{
    program: string
    eligible: number
    conditional: number
    not_eligible: number
    total: number
  }>
  scoreDistribution: Array<{
    range: string
    count: number
  }>
  commonMissingRequirements: Array<{
    requirement: string
    count: number
    percentage: number
  }>
}

export function EligibilityDashboard() {
  const [metrics, setMetrics] = useState<EligibilityMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedProgram, setSelectedProgram] = useState<string>('all')
  const [programs, setPrograms] = useState<Array<{ id: string; name: string }>>([])

  const loadPrograms = useCallback(async () => {
    try {
      const data = await catalogService.getPrograms()
      if (data) {
        const activePrograms = (data as Array<{ id: string; name: string; is_active?: boolean }>)
          .filter(p => p.is_active !== false)
          .map(p => ({ id: p.id, name: p.name }))
        setPrograms(activePrograms)
      }
    } catch (error) {
      console.error('Failed to load programs:', error)
    }
  }, [])

  const loadDashboardData = useCallback(async () => {
    setLoading(true)
    try {
      // Get eligibility assessments via new API client
      const params = new URLSearchParams()
      params.set('action', 'eligibility-assessments')
      if (selectedProgram && selectedProgram !== 'all') params.set('program_id', selectedProgram)
      const data = await apiClient.request<{ assessments: EligibilityAssessmentWithProgram[] }>(`/admin?${params}`)

      if (data?.assessments) {
        const normalizedAssessments = normalizeAssessments(
          data.assessments
        )
        const metrics = calculateMetrics(normalizedAssessments)
        setMetrics(metrics)
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }, [selectedProgram])

  useEffect(() => {
    loadDashboardData()
    loadPrograms()
  }, [loadDashboardData, loadPrograms])

  const calculateMetrics = (assessments: DashboardEligibilityAssessment[]): EligibilityMetrics => {
    const totalApplications = assessments.length
    const eligibleCount = assessments.filter(a => a.eligibility_status === 'eligible').length
    const conditionalCount = assessments.filter(a => a.eligibility_status === 'conditional').length
    const notEligibleCount = assessments.filter(a => a.eligibility_status === 'not_eligible').length

    const averageScore = assessments.length > 0 
      ? assessments.reduce((sum, a) => sum + a.overall_score, 0) / assessments.length
      : 0

    // Program breakdown
    const programMap = new Map<
      string,
      { eligible: number; conditional: number; not_eligible: number; total: number }
    >()
    assessments.forEach(a => {
      const programName = a.programs?.name || 'Unknown'
      if (!programMap.has(programName)) {
        programMap.set(programName, { eligible: 0, conditional: 0, not_eligible: 0, total: 0 })
      }
      const stats = programMap.get(programName)!
      stats.total++
      if (a.eligibility_status === 'eligible') stats.eligible++
      if (a.eligibility_status === 'conditional') stats.conditional++
      if (a.eligibility_status === 'not_eligible') stats.not_eligible++
    })

    const programBreakdown = Array.from(programMap.entries()).map(([program, stats]) => ({
      program,
      ...stats
    }))

    // Score distribution
    const scoreRanges = [
      { range: '0-20', min: 0, max: 20 },
      { range: '21-40', min: 21, max: 40 },
      { range: '41-60', min: 41, max: 60 },
      { range: '61-80', min: 61, max: 80 },
      { range: '81-100', min: 81, max: 100 }
    ]

    const scoreDistribution = scoreRanges.map(range => ({
      range: range.range,
      count: assessments.filter(a => 
        a.overall_score >= range.min && a.overall_score <= range.max
      ).length
    }))

    // Common missing requirements
    const missingReqMap = new Map()
    assessments.forEach(a => {
      a.missing_requirements.forEach((req: MissingRequirement) => {
        const key = req.description
        missingReqMap.set(key, (missingReqMap.get(key) || 0) + 1)
      })
    })

    const commonMissingRequirements = Array.from(missingReqMap.entries())
      .map(([requirement, count]) => ({
        requirement,
        count,
        percentage: (count / totalApplications) * 100
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    return {
      totalApplications,
      eligibleCount,
      conditionalCount,
      notEligibleCount,
      averageScore,
      programBreakdown,
      scoreDistribution,
      commonMissingRequirements
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-skeleton h-24 rounded-lg"></div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-skeleton h-64 rounded-lg"></div>
            <div className="bg-skeleton h-64 rounded-lg"></div>
          </div>
        </div>
      </div>
    )
  }

  if (!metrics) {
    return (
      <div className="text-center py-12">
        <p className="text-foreground">No eligibility data available</p>
      </div>
    )
  }

  const eligibilityRate = metrics.totalApplications > 0 
    ? ((metrics.eligibleCount + metrics.conditionalCount) / metrics.totalApplications) * 100 
    : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-foreground">Eligibility Metrics Dashboard</h2>
        <select
          value={selectedProgram}
          onChange={(e) => setSelectedProgram(e.target.value)}
          className="px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Programs</option>
          {programs.map(program => (
            <option key={program.id} value={program.id}>{program.name}</option>
          ))}
        </select>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-card rounded-lg shadow p-6">
          <div className="flex items-center">
            <Users className="h-8 w-8 text-primary" />
            <div className="ml-4">
              <p className="text-sm font-medium text-foreground">Total Applications</p>
              <p className="text-2xl font-bold text-foreground">{metrics.totalApplications}</p>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow p-6">
          <div className="flex items-center">
            <CheckCircle className="h-8 w-8 text-accent" />
            <div className="ml-4">
              <p className="text-sm font-medium text-foreground">Eligible</p>
              <p className="text-2xl font-bold text-foreground">{metrics.eligibleCount}</p>
              <p className="text-xs text-foreground">
                {metrics.totalApplications > 0 ? Math.round((metrics.eligibleCount / metrics.totalApplications) * 100) : 0}%
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow p-6">
          <div className="flex items-center">
            <Target className="h-8 w-8 text-orange-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-foreground">Average Score</p>
              <p className="text-2xl font-bold text-foreground">{Math.round(metrics.averageScore)}%</p>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow p-6">
          <div className="flex items-center">
            <TrendingUp className="h-8 w-8 text-secondary" />
            <div className="ml-4">
              <p className="text-sm font-medium text-foreground">Eligibility Rate</p>
              <p className="text-2xl font-bold text-foreground">{Math.round(eligibilityRate)}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Eligibility Status Distribution */}
        <div className="bg-card rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Eligibility Status Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={[
                  { name: 'Eligible', value: metrics.eligibleCount, color: '#10B981' },
                  { name: 'Conditional', value: metrics.conditionalCount, color: '#F59E0B' },
                  { name: 'Not Eligible', value: metrics.notEligibleCount, color: '#EF4444' }
                ]}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {[
                  { name: 'Eligible', value: metrics.eligibleCount, color: '#10B981' },
                  { name: 'Conditional', value: metrics.conditionalCount, color: '#F59E0B' },
                  { name: 'Not Eligible', value: metrics.notEligibleCount, color: '#EF4444' }
                ].map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Score Distribution */}
        <div className="bg-card rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Score Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={metrics.scoreDistribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="range" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#3B82F6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Program Breakdown */}
      {metrics.programBreakdown.length > 0 && (
        <div className="bg-card rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Program Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-foreground uppercase tracking-wider">
                    Program
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-foreground uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-foreground uppercase tracking-wider">
                    Eligible
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-foreground uppercase tracking-wider">
                    Conditional
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-foreground uppercase tracking-wider">
                    Not Eligible
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-foreground uppercase tracking-wider">
                    Success Rate
                  </th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {metrics.programBreakdown.map((program, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">
                      {program.program}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                      {program.total}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-warning-strong">
                      {program.eligible}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-warning-strong">
                      {program.conditional}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-destructive">
                      {program.not_eligible}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                      {program.total > 0 ? Math.round(((program.eligible + program.conditional) / program.total) * 100) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Common Missing Requirements */}
      {metrics.commonMissingRequirements.length > 0 && (
        <div className="bg-card rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Most Common Missing Requirements</h3>
          <div className="space-y-3">
            {metrics.commonMissingRequirements.map((req, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{req.requirement}</p>
                  <p className="text-xs text-foreground">{req.count} applications affected</p>
                </div>
                <div className="text-right">
                  <span className="text-sm font-medium text-foreground">
                    {Math.round(req.percentage)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}