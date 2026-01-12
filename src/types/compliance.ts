// Regulatory Compliance Types for MIHAS System

export interface RegulatoryBody {
  id: string
  name: string
  acronym: 'HPCZ' | 'GNC' | 'NMCZ' | 'ECZ'
  fullName: string
  jurisdiction: string
  contactInfo: {
    address: string
    phone: string
    email: string
    website: string
  }
  reportingRequirements: string[]
}

export interface ComplianceReport {
  id: string
  title: string
  regulatoryBody: RegulatoryBody['acronym']
  reportType: 'admission_statistics' | 'program_compliance' | 'student_outcomes' | 'audit_trail' | 'custom'
  generatedAt: string
  reportingPeriod: {
    startDate: string
    endDate: string
    label: string
  }
  status: 'draft' | 'pending_review' | 'approved' | 'submitted' | 'archived'
  submittedAt?: string
  submittedBy?: string
  approvedBy?: string
  approvedAt?: string
}

export interface HPCZReport extends ComplianceReport {
  regulatoryBody: 'HPCZ'
  data: {
    programStatistics: {
      program: string
      totalApplications: number
      admittedStudents: number
      completionRate: number
      graduationRate: number
    }[]
    studentDemographics: {
      totalStudents: number
      byGender: { male: number; female: number }
      byProvince: Record<string, number>
      byAge: Record<string, number>
    }
    qualityMetrics: {
      averageGrade: number
      passRate: number
      employmentRate: number
    }
    complianceChecklist: {
      item: string
      status: 'compliant' | 'non_compliant' | 'partial'
      evidence: string
      notes?: string
    }[]
  }
}

export interface GNCReport extends ComplianceReport {
  regulatoryBody: 'GNC'
  data: {
    nursingPrograms: {
      program: string
      accreditationStatus: 'accredited' | 'provisional' | 'pending'
      studentCapacity: number
      currentEnrollment: number
      clinicalPlacements: number
    }[]
    facultyQualifications: {
      totalFaculty: number
      qualifiedFaculty: number
      studentFacultyRatio: number
    }
    clinicalTraining: {
      totalClinicalHours: number
      hospitalPartnerships: number
      studentSatisfaction: number
    }
  }
}

export interface NMCZReport extends ComplianceReport {
  regulatoryBody: 'NMCZ'
  data: {
    midwiferyPrograms: {
      program: string
      registrationStatus: 'registered' | 'provisional' | 'pending'
      practicalTraining: {
        totalHours: number
        deliveriesAttended: number
        competencyAssessments: number
      }
    }[]
    continuingEducation: {
      totalParticipants: number
      coursesOffered: number
      completionRate: number
    }
  }
}

export interface ECZReport extends ComplianceReport {
  regulatoryBody: 'ECZ'
  data: {
    gradeValidation: {
      totalGradesProcessed: number
      validGrades: number
      invalidGrades: number
      gradingSystemCompliance: boolean
    }
    examResults: {
      subject: string
      totalCandidates: number
      passRate: number
      averageGrade: number
    }[]
    certificateVerification: {
      totalVerifications: number
      successfulVerifications: number
      failedVerifications: number
    }
  }
}

export interface ComplianceAuditTrail {
  id: string
  reportId: string
  action: 'created' | 'modified' | 'reviewed' | 'approved' | 'submitted' | 'archived'
  performedBy: string
  performedAt: string
  changes?: {
    field: string
    oldValue: any
    newValue: any
  }[]
  notes?: string
  ipAddress: string
  userAgent: string
}

export interface ComplianceValidation {
  isValid: boolean
  errors: {
    field: string
    message: string
    severity: 'error' | 'warning' | 'info'
  }[]
  warnings: {
    field: string
    message: string
    recommendation: string
  }[]
  completeness: number // 0-100 percentage
}

export interface ComplianceTemplate {
  id: string
  name: string
  regulatoryBody: RegulatoryBody['acronym']
  reportType: ComplianceReport['reportType']
  version: string
  fields: {
    id: string
    name: string
    type: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'table'
    required: boolean
    validation?: {
      min?: number
      max?: number
      pattern?: string
      options?: string[]
    }
    description: string
    helpText?: string
  }[]
  calculations: {
    field: string
    formula: string
    dependencies: string[]
  }[]
  validationRules: {
    rule: string
    message: string
    severity: 'error' | 'warning'
  }[]
}

export interface ComplianceSchedule {
  id: string
  regulatoryBody: RegulatoryBody['acronym']
  reportType: ComplianceReport['reportType']
  frequency: 'monthly' | 'quarterly' | 'semi_annual' | 'annual'
  dueDate: string
  reminderDays: number[]
  autoGenerate: boolean
  assignedTo: string[]
  status: 'scheduled' | 'in_progress' | 'overdue' | 'completed'
}

export interface ComplianceMetrics {
  totalReports: number
  reportsByStatus: Record<ComplianceReport['status'], number>
  reportsByRegulator: Record<RegulatoryBody['acronym'], number>
  onTimeSubmissions: number
  overdueReports: number
  complianceScore: number // 0-100
  trendsOverTime: {
    period: string
    reportsSubmitted: number
    onTimeRate: number
  }[]
}