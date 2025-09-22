import React, { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { EligibilityDashboard } from '../../components/application/EligibilityDashboard'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { TextArea } from '../../components/ui/TextArea'
import { Plus, Edit, Trash2, Save, X, Settings, BarChart3, Users, AlertTriangle } from 'lucide-react'

interface Program {
  id: string
  name: string
  code: string
  description: string
}

interface EligibilityRule {
  id: string
  program_id: string
  rule_name: string
  rule_type: string
  condition_json: any
  weight: number
  is_active: boolean
}

export default function EligibilityManagement() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'dashboard' | 'rules' | 'guidelines' | 'appeals'>('dashboard')
  const [programs, setPrograms] = useState<Program[]>([])
  const [rules, setRules] = useState<EligibilityRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showRuleForm, setShowRuleForm] = useState(false)
  const [editingRule, setEditingRule] = useState<EligibilityRule | null>(null)

  const [ruleForm, setRuleForm] = useState({
    program_id: '',
    rule_name: '',
    rule_type: 'subject_count',
    condition_json: '{}',
    weight: 1.0,
    is_active: true
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        loadPrograms(),
        loadRules()
      ])
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadPrograms = async () => {
    const { data, error } = await supabase
      .from('programs')
      .select('*')
      .eq('is_active', true)
      .order('name')
    
    if (error) throw error
    setPrograms(data || [])
  }

  const loadRules = async () => {
    const { data, error } = await supabase
      .from('eligibility_rules')
      .select(`
        *,
        programs (name)
      `)
      .order('created_at', { ascending: false })
    
    if (error) throw error
    setRules(data || [])
  }

  const handleSaveRule = async () => {
    try {
      const ruleData = {
        ...ruleForm,
        condition_json: JSON.parse(ruleForm.condition_json)
      }

      if (editingRule) {
        const { error } = await supabase
          .from('eligibility_rules')
          .update(ruleData)
          .eq('id', editingRule.id)
        
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('eligibility_rules')
          .insert(ruleData)
        
        if (error) throw error
      }

      await loadRules()
      setShowRuleForm(false)
      setEditingRule(null)
      resetRuleForm()
    } catch (error) {
      console.error('Error saving rule:', error)
      alert('Failed to save rule')
    }
  }

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return

    try {
      const { error } = await supabase
        .from('eligibility_rules')
        .delete()
        .eq('id', id)
      
      if (error) throw error
      await loadRules()
    } catch (error) {
      console.error('Error deleting rule:', error)
      alert('Failed to delete rule')
    }
  }

  const handleEditRule = (rule: EligibilityRule) => {
    setEditingRule(rule)
    setRuleForm({
      program_id: rule.program_id,
      rule_name: rule.rule_name,
      rule_type: rule.rule_type,
      condition_json: JSON.stringify(rule.condition_json, null, 2),
      weight: rule.weight,
      is_active: rule.is_active
    })
    setShowRuleForm(true)
  }

  const resetRuleForm = () => {
    setRuleForm({
      program_id: '',
      rule_name: '',
      rule_type: 'subject_count',
      condition_json: '{}',
      weight: 1.0,
      is_active: true
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Eligibility Management System
          </h1>
          <p className="text-gray-600">
            Manage course requirements, regulatory compliance, and eligibility assessments
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8 px-6">
              {[
                { id: 'dashboard', name: 'Analytics Dashboard', icon: BarChart3 },
                { id: 'rules', name: 'Eligibility Rules', icon: Settings }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <tab.icon className="h-5 w-5" />
                  <span>{tab.name}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'dashboard' && (
          <EligibilityDashboard />
        )}

        {activeTab === 'rules' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Eligibility Rules</h2>
              <Button
                onClick={() => {
                  resetRuleForm()
                  setShowRuleForm(true)
                }}
                className="flex items-center space-x-2"
              >
                <Plus className="h-4 w-4" />
                <span>Add Rule</span>
              </Button>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Rule Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Program
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Weight
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {rules.map((rule) => (
                    <tr key={rule.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {rule.rule_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {(rule as any).programs?.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {rule.rule_type}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {rule.weight}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          rule.is_active 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {rule.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <button
                          onClick={() => handleEditRule(rule)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Rule Form Modal */}
        {showRuleForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg max-w-2xl w-full mx-4 p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">
                  {editingRule ? 'Edit Rule' : 'Add New Rule'}
                </h3>
                <button
                  onClick={() => {
                    setShowRuleForm(false)
                    setEditingRule(null)
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="program" className="block text-sm font-medium text-gray-700 mb-1">
                    Program
                  </label>
                  <select
                    id="program"
                    value={ruleForm.program_id}
                    onChange={(e) => setRuleForm({ ...ruleForm, program_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Program</option>
                    {programs.map((program) => (
                      <option key={program.id} value={program.id}>
                        {program.name}
                      </option>
                    ))}
                  </select>
                </div>

                <Input
                  label="Rule Name"
                  value={ruleForm.rule_name}
                  onChange={(e) => setRuleForm({ ...ruleForm, rule_name: e.target.value })}
                />

                <div>
                  <label htmlFor="rule_type" className="block text-sm font-medium text-gray-700 mb-1">
                    Rule Type
                  </label>
                  <select
                    id="rule_type"
                    value={ruleForm.rule_type}
                    onChange={(e) => setRuleForm({ ...ruleForm, rule_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="subject_count">Subject Count</option>
                    <option value="grade_average">Grade Average</option>
                    <option value="specific_subject">Specific Subject</option>
                    <option value="composite">Composite</option>
                  </select>
                </div>

                <TextArea
                  label="Condition JSON"
                  value={ruleForm.condition_json}
                  onChange={(e) => setRuleForm({ ...ruleForm, condition_json: e.target.value })}
                  rows={4}
                  placeholder='{"min_subjects": 5, "grade_threshold": 6}'
                />

                <Input
                  label="Weight"
                  type="number"
                  step="0.1"
                  value={ruleForm.weight}
                  onChange={(e) => setRuleForm({ ...ruleForm, weight: parseFloat(e.target.value) })}
                />

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={ruleForm.is_active}
                    onChange={(e) => setRuleForm({ ...ruleForm, is_active: e.target.checked })}
                    className="mr-2"
                  />
                  <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
                    Active
                  </label>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowRuleForm(false)
                    setEditingRule(null)
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleSaveRule}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Rule
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}