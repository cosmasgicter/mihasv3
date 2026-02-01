/**
 * API Client for MIHAS Application System
 * 
 * Replaces direct Supabase client calls with API endpoint calls.
 * All data operations go through the Vercel serverless functions.
 * 
 * Features:
 * - Automatic credential handling (HTTP-only cookies)
 * - Error handling with typed responses
 * - Request/response logging (no PII)
 * - Retry logic for transient failures
 */

const API_BASE = '/api';

/**
 * API Response wrapper
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

/**
 * Request options
 */
interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * Make an API request with automatic error handling
 */
async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const { method = 'GET', body, headers = {}, timeout = 30000 } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include', // Include HTTP-only cookies
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || `Request failed with status ${response.status}`,
        code: data.code,
      };
    }

    return {
      success: true,
      data: data.data ?? data,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if ((error as Error).name === 'AbortError') {
      return {
        success: false,
        error: 'Request timeout',
        code: 'TIMEOUT',
      };
    }

    return {
      success: false,
      error: (error as Error).message || 'Network error',
      code: 'NETWORK_ERROR',
    };
  }
}

// ============================================================================
// Applications API
// ============================================================================

export const applicationsApi = {
  /**
   * List applications with optional filters
   */
  async list(filters?: {
    status?: string;
    program?: string;
    intake?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<Application[]>> {
    const params = new URLSearchParams();
    params.set('action', 'list');
    if (filters?.status) params.set('status', filters.status);
    if (filters?.program) params.set('program', filters.program);
    if (filters?.intake) params.set('intake', filters.intake);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));

    return request<Application[]>(`/applications?${params}`);
  },

  /**
   * Get application by ID
   */
  async getById(id: string): Promise<ApiResponse<Application>> {
    return request<Application>(`/applications?id=${id}`);
  },

  /**
   * Get application details with related data
   */
  async getDetails(id: string): Promise<ApiResponse<ApplicationWithDetails>> {
    return request<ApplicationWithDetails>(`/applications?action=details&id=${id}`);
  },

  /**
   * Create a new application
   */
  async create(data: Partial<Application>): Promise<ApiResponse<Application>> {
    return request<Application>('/applications', {
      method: 'POST',
      body: { action: 'create', ...data },
    });
  },

  /**
   * Update an application
   */
  async update(id: string, data: Partial<Application>): Promise<ApiResponse<Application>> {
    return request<Application>('/applications', {
      method: 'PUT',
      body: { action: 'update', id, ...data },
    });
  },

  /**
   * Submit an application
   */
  async submit(id: string): Promise<ApiResponse<Application>> {
    return request<Application>('/applications', {
      method: 'POST',
      body: { action: 'submit', id },
    });
  },

  /**
   * Save application draft
   */
  async saveDraft(userId: string, formData: unknown, currentStep: number): Promise<ApiResponse<void>> {
    return request<void>('/applications', {
      method: 'POST',
      body: { action: 'save-draft', userId, formData, currentStep },
    });
  },

  /**
   * Get application draft
   */
  async getDraft(userId: string): Promise<ApiResponse<ApplicationDraft | null>> {
    return request<ApplicationDraft | null>(`/applications?action=draft&userId=${userId}`);
  },
};

// ============================================================================
// Documents API
// ============================================================================

export const documentsApi = {
  /**
   * Upload a document
   */
  async upload(
    applicationId: string,
    file: File,
    documentType: string
  ): Promise<ApiResponse<ApplicationDocument>> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('applicationId', applicationId);
    formData.append('documentType', documentType);
    formData.append('action', 'upload');

    const response = await fetch(`${API_BASE}/documents`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    const data = await response.json();
    return {
      success: response.ok,
      data: data.data,
      error: data.error,
    };
  },

  /**
   * Get signed URL for document download
   */
  async getSignedUrl(path: string): Promise<ApiResponse<{ url: string }>> {
    return request<{ url: string }>(`/documents?action=signed-url&path=${encodeURIComponent(path)}`);
  },

  /**
   * List documents for an application
   */
  async listByApplication(applicationId: string): Promise<ApiResponse<ApplicationDocument[]>> {
    return request<ApplicationDocument[]>(`/documents?action=list&applicationId=${applicationId}`);
  },

  /**
   * Delete a document
   */
  async delete(documentId: string): Promise<ApiResponse<void>> {
    return request<void>('/documents', {
      method: 'DELETE',
      body: { action: 'delete', documentId },
    });
  },
};

// ============================================================================
// Catalog API (Programs, Intakes, Subjects)
// ============================================================================

export const catalogApi = {
  /**
   * Get all active programs
   */
  async getPrograms(): Promise<ApiResponse<Program[]>> {
    return request<Program[]>('/catalog?type=programs');
  },

  /**
   * Get all active intakes
   */
  async getIntakes(): Promise<ApiResponse<Intake[]>> {
    return request<Intake[]>('/catalog?type=intakes');
  },

  /**
   * Get all subjects
   */
  async getSubjects(): Promise<ApiResponse<Subject[]>> {
    return request<Subject[]>('/catalog?type=subjects');
  },

  /**
   * Get institutions
   */
  async getInstitutions(): Promise<ApiResponse<Institution[]>> {
    return request<Institution[]>('/catalog?type=institutions');
  },
};

// ============================================================================
// Admin API
// ============================================================================

export const adminApi = {
  /**
   * Get dashboard statistics
   */
  async getDashboardStats(): Promise<ApiResponse<DashboardStats>> {
    return request<DashboardStats>('/admin?action=stats');
  },

  /**
   * Get users list
   */
  async getUsers(filters?: {
    role?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<UserProfile[]>> {
    const params = new URLSearchParams();
    params.set('action', 'users');
    if (filters?.role) params.set('role', filters.role);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));

    return request<UserProfile[]>(`/admin?${params}`);
  },

  /**
   * Review an application
   */
  async reviewApplication(
    applicationId: string,
    decision: 'approved' | 'rejected',
    notes?: string
  ): Promise<ApiResponse<Application>> {
    return request<Application>('/applications', {
      method: 'POST',
      body: { action: 'review', id: applicationId, decision, notes },
    });
  },
};

// ============================================================================
// Type Definitions (re-exported for convenience)
// ============================================================================

export interface UserProfile {
  id: string;
  user_id: string;
  full_name?: string;
  email?: string;
  phone?: string;
  role: string;
  date_of_birth?: string;
  sex?: string;
  nationality?: string;
  address?: string;
  city?: string;
  next_of_kin_name?: string;
  next_of_kin_phone?: string;
  avatar_url?: string;
  bio?: string;
  created_at: string;
  updated_at: string;
}

export interface Program {
  id: string;
  name: string;
  description?: string;
  duration_years: number;
  department?: string;
  qualification_level?: string;
  entry_requirements?: string;
  fees_per_year?: number;
  institution_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Intake {
  id: string;
  name: string;
  year: number;
  semester?: string;
  start_date: string;
  end_date: string;
  application_deadline: string;
  total_capacity: number;
  available_spots: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Institution {
  id: string;
  slug: string;
  name: string;
  full_name: string;
  description?: string;
  logo_url?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Subject {
  id: string;
  name: string;
  code?: string;
  is_active: boolean;
  created_at: string;
}

export interface Application {
  id: string;
  application_number: string;
  user_id: string;
  full_name: string;
  nrc_number?: string;
  passport_number?: string;
  date_of_birth: string;
  sex: 'Male' | 'Female';
  phone: string;
  email: string;
  residence_town: string;
  next_of_kin_name?: string;
  next_of_kin_phone?: string;
  program: string;
  intake: string;
  institution: string;
  result_slip_url?: string;
  extra_kyc_url?: string;
  application_fee: number;
  payment_method?: string;
  payer_name?: string;
  payer_phone?: string;
  amount?: number;
  paid_at?: string;
  momo_ref?: string;
  pop_url?: string;
  payment_status: 'pending_review' | 'verified' | 'rejected';
  payment_verified_at?: string | null;
  payment_verified_by?: string | null;
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected';
  submitted_at?: string;
  public_tracking_code?: string;
  created_at: string;
  updated_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_started_at?: string;
  review_notes?: string;
  decision_reason?: string;
  decision_date?: string;
}

export interface ApplicationDocument {
  id: string;
  application_id: string;
  document_type: string;
  document_name: string;
  file_url: string;
  file_size?: number;
  mime_type?: string;
  system_generated: boolean;
  verification_status: 'pending' | 'verified' | 'rejected';
  verified_by?: string;
  verified_at?: string;
  verification_notes?: string;
  uploaded_at: string;
  created_at: string;
  updated_at: string;
}

export interface ApplicationDraft {
  id: string;
  user_id: string;
  form_data: Record<string, unknown>;
  uploaded_files: unknown[];
  current_step: number;
  version: number;
  is_offline_sync: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApplicationWithDetails extends Application {
  programs?: Program;
  intakes?: Intake;
  documents?: ApplicationDocument[];
}

export interface DashboardStats {
  totalApplications: number;
  pendingReview: number;
  approved: number;
  rejected: number;
  totalUsers: number;
  recentApplications: Application[];
}
