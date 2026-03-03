import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchEligibilityRules, createEligibilityRule, updateEligibilityRule, deleteEligibilityRule, type EligibilityRule } from '@/lib/api/adminApi'
import { programService } from '@/services/catalog'
import { EligibilityDashboard } from '@/components/application/EligibilityDashboard'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { StandaloneSelect } from '@/components/ui/standalone-select'
import { useToastStore } from '@/components/ui/Toast'
import { Plus, Edit, Trash2, Save, X, Settings, BarChart3, Users, AlertTriangle } from 'lucide-react'
import { RegulatoryGuidelinesTable } from '@/components/admin/RegulatoryGuidelinesTable'
import { ConfirmAlertDialog } from '@/components/ui/alert-dialog'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useEscapeKey } from '@/hooks/useEscapeKey'

interface Program {
  id: string
  name: string
  code?: string
  description?: string
}

export default function EligibilityManagement() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'dashboard' | 'rules' | 'guidelines'>('dashboard')
  const [programs, setPrograms] = useState<Program[]>([])
  const [rules, setRules] = useState<EligibilityRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showRuleForm, setShowRuleForm] = useState(false)
  const [editingRule, setEditingRule] = useState<EligibilityRule | null>(null)
  const confirmDialog = useConfirmDialog()
  const focusTrapRef = useFocusTrap(showRuleForm)
  useEscapeKey(showRuleForm, () => {
    setShowRuleForm(false)
    setEditingRule(null)
  })
  const { error: showError } = useToastStore()

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
    const response = await programService.list()
    setPrograms(response?.programs || [])
  }

  const loadRules = async () => {
    const data = await fetchEligibilityRules()
    setRules(data)
  }

  const handleSaveRule = async () => {
    try {
      const ruleData = {
        program_id: ruleForm.program_id,
        rule_name: ruleForm.rule_name,
        rule_type: ruleForm.rule_type,
        condition_json: JSON.parse(ruleForm.condition_json),
        weight: ruleForm.weight,
        is_active: ruleForm.is_active
      }

      if (editingRule) {
        const success = await updateEligibilityRule(editingRule.id, ruleData)
        if (!success) throw new Error('Failed to update rule')
      } else {
        const success = await createEligibilityRule(ruleData)
        if (!success) throw new Error('Failed to create rule')
      }

      await loadRules()
      setShowRuleForm(false)
      setEditingRule(null)
      resetRuleForm()
    } catch (error) {
      console.error('Error saving rule:', error)
      showError('Failed to save rule')
    }
  }

  const handleDeleteRule = async (id: string) => {
    const confirmed = await confirmDialog.confirm({
      title: 'Delete Rule',
      message: 'This eligibility rule will be permanently deleted.',
      confirmText: 'Delete',
      variant: 'danger'
    })
    if (!confirmed) return

    try {
      const success = await deleteEligibilityRule(id)
      if (!success) throw new Error('Failed to delete rule')
      await loadRules()
    } catch (error) {
      console.error('Error deleting rule:', error)
      showError('Failed to delete rule')
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
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Eligibility Management System
          </h1>
          <p className="text-foreground">
            Manage course requirements, regulatory compliance, and eligibility assessments
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="bg-card rounded-lg shadow mb-8">
          <div className="border-b border-border">
            <nav className="-mb-px flex space-x-8 px-6">
              {[
                { id: 'dashboard' as const, name: 'Analytics Dashboard', icon: BarChart3 },
                { id: 'rules' as const, name: 'Eligibility Rules', icon: Settings },
                { id: 'guidelines' as const, name: 'Regulatory Guidelines', icon: AlertTriangle }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-foreground hover:text-foreground hover:border-input'
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
              <h2 className="text-xl font-semibold text-foreground">Eligibility Rules</h2>
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

            <div className="bg-card rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-foreground uppercase tracking-wider">
                      Rule Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-foreground uppercase tracking-wider">
                      Program
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-foreground uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-foreground uppercase tracking-wider">
                      Weight
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-foreground uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-foreground uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {rules.map((rule) => (
                    <tr key={rule.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">
                        {rule.rule_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                        {rule.programs?.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                        {rule.rule_type}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                        {rule.weight}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          rule.is_active 
                            ? 'bg-accent/10 text-accent-foreground' 
                            : 'bg-destructive/10 text-destructive-foreground'
                        }`}>
                          {rule.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <button
                          onClick={() => handleEditRule(rule)}
                          className="text-primary hover:text-primary-foreground"
                          aria-label={`Edit ${rule.rule_name} rule`}
                        >
                          <Edit className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="text-destructive hover:text-red-900"
                          aria-label={`Delete ${rule.rule_name} rule`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'guidelines' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Regulatory Guidelines</h2>
                <p className="text-foreground mt-1">
                  HPCZ, NMCZ, and ECZ compliance requirements for health and education programs
                </p>
              </div>
            </div>
            <RegulatoryGuidelinesTable />
          </div>
        )}

        {/* Rule Form Modal */}
        {showRuleForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div
              ref={focusTrapRef as React.RefObject<HTMLDivElement>}
              role="dialog"
              aria-modal="true"
              aria-label={editingRule ? 'Edit Rule' : 'Add New Rule'}
              className="bg-card rounded-lg max-w-2xl w-full mx-4 p-6"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">
                  {editingRule ? 'Edit Rule' : 'Add New Rule'}
                </h3>
                <button
                  onClick={() => {
                    setShowRuleForm(false)
                    setEditingRule(null)
                  }}
                  className="text-foreground hover:text-foreground"
                  aria-label="Close rule form"
                >
                  <X className="h-6 w-6" aria-hidden="true" />
                </button>
              </div>

              <div className="space-y-4">
                <StandaloneSelect
                  value={ruleForm.program_id}
                  onChange={(value) => setRuleForm({ ...ruleForm, program_id: value })}
                  options={programs.map((program) => ({
                    value: program.id,
                    label: program.name,
                  }))}
                  label="Program"
                  placeholder="Select Program"
                />

                <Input
                  label="Rule Name"
                  value={ruleForm.rule_name}
                  onChange={(e) => setRuleForm({ ...ruleForm, rule_name: e.target.value })}
                />

                <StandaloneSelect
                  value={ruleForm.rule_type}
                  onChange={(value) => setRuleForm({ ...ruleForm, rule_type: value })}
                  options={[
                    { value: 'subject_count', label: 'Subject Count' },
                    { value: 'grade_average', label: 'Grade Average' },
                    { value: 'specific_subject', label: 'Specific Subject' },
                    { value: 'composite', label: 'Composite' },
                  ]}
                  label="Rule Type"
                />

                <Textarea
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
                  <label htmlFor="is_active" className="text-sm font-medium text-foreground">
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
      <ConfirmAlertDialog
        isOpen={confirmDialog.isOpen}
        onClose={confirmDialog.handleCancel}
        onConfirm={confirmDialog.handleConfirm}
        title={confirmDialog.options.title}
        message={confirmDialog.options.message}
        confirmText={confirmDialog.options.confirmText}
        cancelText={confirmDialog.options.cancelText}
        variant={confirmDialog.options.variant}
      />
    </div>
  )
}