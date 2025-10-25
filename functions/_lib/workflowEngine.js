import { supabaseAdminClient } from './supabaseClient.js'
import { sendEmail } from './emailService.js'

export async function executeWorkflows(triggerEvent, applicationData, env = {}) {
  try {
    const { data: rules } = await supabaseAdminClient
      .from('workflow_rules')
      .select('*')
      .eq('trigger_event', triggerEvent)
      .eq('enabled', true)
      .order('priority', { ascending: false })

    if (!rules?.length) return

    for (const rule of rules) {
      const conditionsMet = evaluateConditions(rule.conditions, applicationData)
      
      await supabaseAdminClient.from('workflow_executions').insert({
        rule_id: rule.id,
        application_id: applicationData.id,
        trigger_event: triggerEvent,
        conditions_met: conditionsMet,
        actions_executed: [],
        status: 'pending'
      })

      if (conditionsMet) {
        await executeActions(rule.actions, applicationData, rule.id)
      }
    }
  } catch (error) {
    console.error('Workflow execution error:', error)
  }
}

function evaluateConditions(conditions, data) {
  if (!conditions?.length) return true

  return conditions.every(condition => {
    const value = data[condition.field]
    
    switch (condition.operator) {
      case 'equals': return value === condition.value
      case 'not_equals': return value !== condition.value
      case 'contains': return String(value).includes(condition.value)
      case 'greater_than': return Number(value) > Number(condition.value)
      case 'less_than': return Number(value) < Number(condition.value)
      default: return false
    }
  })
}

async function executeActions(actions, data, ruleId) {
  const executed = []

  for (const action of actions) {
    try {
      switch (action.type) {
        case 'update_status':
          await supabaseAdminClient
            .from('applications')
            .update({ status: action.params.status })
            .eq('id', data.id)
          executed.push({ type: action.type, success: true })
          break

        case 'send_notification':
          await supabaseAdminClient.from('in_app_notifications').insert({
            user_id: data.user_id,
            title: action.params.title,
            content: action.params.message,
            type: 'info',
            read: false
          })
          executed.push({ type: action.type, success: true })
          break

        case 'send_email':
          if (data.email) {
            await sendEmail({
              to: data.email,
              subject: action.params.subject,
              html: action.params.body,
              env
            })
            executed.push({ type: action.type, success: true })
          }
          break

        default:
          executed.push({ type: action.type, success: false, error: 'Unknown action' })
      }
    } catch (error) {
      executed.push({ type: action.type, success: false, error: error.message })
    }
  }

  await supabaseAdminClient
    .from('workflow_executions')
    .update({ 
      actions_executed: executed,
      status: executed.every(e => e.success) ? 'success' : 'partial'
    })
    .eq('rule_id', ruleId)
    .eq('application_id', data.id)
}
