export type CatalogTab = 'programs' | 'institutions'
export type ProgramDialogTarget = 'create-program' | 'edit-program' | null

export interface Institution {
  id: string
  name: string
  full_name?: string
  code?: string
  description?: string
  is_active?: boolean
  address?: string
  phone?: string
  email?: string
  website?: string
}

export interface Program {
  id: string
  name: string
  description?: string
  duration_years: number
  institution_id: string
  is_active?: boolean
  institutions?: Institution | null
  tuition_fee?: string
  regulatory_body?: string
  accreditation_status?: string
}

export interface ProgramsState {
  activeTab: CatalogTab
  error: string
  saving: boolean
  showProgramCreate: boolean
  showProgramEdit: boolean
  showProgramDelete: boolean
  currentProgram: Program | null
  showInstitutionCreate: boolean
  showInstitutionEdit: boolean
  showInstitutionDelete: boolean
  currentInstitution: Institution | null
  institutionCreateReturnTarget: ProgramDialogTarget
}

export const initialProgramsState: ProgramsState = {
  activeTab: 'programs',
  error: '',
  saving: false,
  showProgramCreate: false,
  showProgramEdit: false,
  showProgramDelete: false,
  currentProgram: null,
  showInstitutionCreate: false,
  showInstitutionEdit: false,
  showInstitutionDelete: false,
  currentInstitution: null,
  institutionCreateReturnTarget: null,
}

export type ProgramsAction =
  | { type: 'SET_TAB'; payload: CatalogTab }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'OPEN_PROGRAM_CREATE' }
  | { type: 'CLOSE_PROGRAM_CREATE' }
  | { type: 'OPEN_PROGRAM_EDIT'; program: Program }
  | { type: 'CLOSE_PROGRAM_EDIT' }
  | { type: 'OPEN_PROGRAM_DELETE'; program: Program }
  | { type: 'CLOSE_PROGRAM_DELETE' }
  | { type: 'OPEN_INSTITUTION_CREATE'; returnTarget?: ProgramDialogTarget }
  | { type: 'CLOSE_INSTITUTION_CREATE' }
  | { type: 'OPEN_INSTITUTION_EDIT'; institution: Institution }
  | { type: 'CLOSE_INSTITUTION_EDIT' }
  | { type: 'OPEN_INSTITUTION_DELETE'; institution: Institution }
  | { type: 'CLOSE_INSTITUTION_DELETE' }
  | { type: 'OPEN_INSTITUTION_CREATE_FROM_PROGRAM'; target: Exclude<ProgramDialogTarget, null> }
  | { type: 'INSTITUTION_CREATED_RETURN' }

export function programsReducer(state: ProgramsState, action: ProgramsAction): ProgramsState {
  switch (action.type) {
    case 'SET_TAB':
      return { ...state, activeTab: action.payload, error: '' }
    case 'SET_ERROR':
      return { ...state, error: action.payload }
    case 'SET_SAVING':
      return { ...state, saving: action.payload }
    case 'OPEN_PROGRAM_CREATE':
      return { ...state, error: '', currentProgram: null, showProgramCreate: true }
    case 'CLOSE_PROGRAM_CREATE':
      return { ...state, showProgramCreate: false }
    case 'OPEN_PROGRAM_EDIT':
      return { ...state, error: '', currentProgram: action.program, showProgramEdit: true }
    case 'CLOSE_PROGRAM_EDIT':
      return { ...state, showProgramEdit: false, currentProgram: null }
    case 'OPEN_PROGRAM_DELETE':
      return { ...state, error: '', currentProgram: action.program, showProgramDelete: true }
    case 'CLOSE_PROGRAM_DELETE':
      return { ...state, showProgramDelete: false, currentProgram: null }
    case 'OPEN_INSTITUTION_CREATE':
      return {
        ...state,
        error: '',
        currentInstitution: null,
        institutionCreateReturnTarget: action.returnTarget ?? null,
        showInstitutionCreate: true,
      }
    case 'CLOSE_INSTITUTION_CREATE':
      return { ...state, showInstitutionCreate: false, institutionCreateReturnTarget: null }
    case 'OPEN_INSTITUTION_EDIT':
      return { ...state, error: '', currentInstitution: action.institution, showInstitutionEdit: true }
    case 'CLOSE_INSTITUTION_EDIT':
      return { ...state, showInstitutionEdit: false, currentInstitution: null }
    case 'OPEN_INSTITUTION_DELETE':
      return { ...state, error: '', currentInstitution: action.institution, showInstitutionDelete: true }
    case 'CLOSE_INSTITUTION_DELETE':
      return { ...state, showInstitutionDelete: false, currentInstitution: null }
    case 'OPEN_INSTITUTION_CREATE_FROM_PROGRAM':
      return {
        ...state,
        error: '',
        currentInstitution: null,
        institutionCreateReturnTarget: action.target,
        showProgramCreate: action.target === 'create-program' ? false : state.showProgramCreate,
        showProgramEdit: action.target === 'edit-program' ? false : state.showProgramEdit,
        showInstitutionCreate: true,
      }
    case 'INSTITUTION_CREATED_RETURN': {
      const target = state.institutionCreateReturnTarget
      return {
        ...state,
        showInstitutionCreate: false,
        institutionCreateReturnTarget: null,
        showProgramCreate: target === 'create-program',
        showProgramEdit: target === 'edit-program',
      }
    }
    default:
      return state
  }
}
