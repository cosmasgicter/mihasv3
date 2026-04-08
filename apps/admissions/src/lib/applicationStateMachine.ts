export type ApplicationStep = 'basicKyc' | 'education' | 'payment' | 'submit'
export type ApplicationState = 'idle' | 'loading' | 'uploading' | 'submitting' | 'success' | 'error'

export interface StateMachineContext {
  currentStep: ApplicationStep
  state: ApplicationState
  applicationId: string | null
  hasResultSlip: boolean
  error: string | null
}

export type StateMachineEvent =
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'START_LOADING' }
  | { type: 'STOP_LOADING' }
  | { type: 'START_UPLOAD' }
  | { type: 'STOP_UPLOAD' }
  | { type: 'SUBMIT' }
  | { type: 'SUCCESS' }
  | { type: 'ERROR'; error: string }
  | { type: 'SET_APPLICATION_ID'; id: string }
  | { type: 'SET_RESULT_SLIP'; hasFile: boolean }

const STEP_ORDER: ApplicationStep[] = ['basicKyc', 'education', 'payment', 'submit']

export function createStateMachine(initialContext: Partial<StateMachineContext> = {}) {
  let context: StateMachineContext = {
    currentStep: 'basicKyc',
    state: 'idle',
    applicationId: null,
    hasResultSlip: false,
    error: null,
    ...initialContext
  }

  const listeners: Set<(context: StateMachineContext) => void> = new Set()

  function notify() {
    listeners.forEach(listener => listener(context))
  }

  function send(event: StateMachineEvent) {
    const prevContext = { ...context }

    switch (event.type) {
      case 'NEXT_STEP': {
        const currentIndex = STEP_ORDER.indexOf(context.currentStep)
        if (currentIndex < STEP_ORDER.length - 1) {
          context = { ...context, currentStep: STEP_ORDER[currentIndex + 1]!, error: null }
        }
        break
      }

      case 'PREV_STEP': {
        const currentIndex = STEP_ORDER.indexOf(context.currentStep)
        if (currentIndex > 0) {
          context = { ...context, currentStep: STEP_ORDER[currentIndex - 1]!, error: null }
        }
        break
      }

      case 'START_LOADING':
        context = { ...context, state: 'loading', error: null }
        break

      case 'STOP_LOADING':
        context = { ...context, state: 'idle' }
        break

      case 'START_UPLOAD':
        context = { ...context, state: 'uploading', error: null }
        break

      case 'STOP_UPLOAD':
        context = { ...context, state: 'idle' }
        break

      case 'SUBMIT':
        context = { ...context, state: 'submitting', error: null }
        break

      case 'SUCCESS':
        context = { ...context, state: 'success', error: null }
        break

      case 'ERROR':
        context = { ...context, state: 'error', error: event.error }
        break

      case 'SET_APPLICATION_ID':
        context = { ...context, applicationId: event.id }
        break

      case 'SET_RESULT_SLIP':
        context = { ...context, hasResultSlip: event.hasFile }
        break
    }

    if (prevContext !== context) {
      notify()
    }
  }

  function subscribe(listener: (context: StateMachineContext) => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function getContext() {
    return context
  }

  function canProceed(): boolean {
    switch (context.currentStep) {
      case 'basicKyc':
        return context.applicationId !== null
      case 'education':
        return context.hasResultSlip
      case 'payment':
        return true // Payment is handled by Lenco widget; gate enforced at submission
      case 'submit':
        return true
      default:
        return false
    }
  }

  return {
    send,
    subscribe,
    getContext,
    canProceed
  }
}

export type ApplicationStateMachine = ReturnType<typeof createStateMachine>
