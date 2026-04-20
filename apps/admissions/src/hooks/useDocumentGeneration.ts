/**
 * Document Generation Hook - Cookie-based authentication
 * 
 * Uses HTTP-only cookies (credentials: 'include') for authentication.
 * Reads payment data from the `payments` table instead of deprecated
 * Application model fields.
 * 
 * @module useDocumentGeneration
 * @requirements 2.7
 */

import { useState } from 'react';
import { logger } from '@/lib/logger';
import { generateApplicationSlip } from '@/lib/applicationSlipPdf';
import { generateAcceptanceLetter } from '@/lib/acceptanceLetterGenerator';
import { generatePaymentReceipt, generateReceiptNumber } from '@/lib/receiptGenerator';
import { applicationService } from '@/services/applications';
import { apiClient } from '@/services/client';

type ApplicationPayload = {
  id?: string;
  application_number?: string;
  public_tracking_code?: string;
  status?: string;
  payment_status?: string;
  payment_verified_at?: string | null;
  payment_verified_by_name?: string | null;
  receipt_number?: string | null;
  application_fee?: number | string | null;
  submitted_at?: string;
  updated_at?: string;
  program?: string;
  intake?: string;
  institution?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  start_date?: string;
  conditions?: Array<{ description: string; deadline?: string }>;
};

interface PaymentRecord {
  id: string;
  status: string;
  amount: number | null;
  currency: string | null;
  payment_method?: string | null;
  transaction_reference?: string | null;
  created_at: string;
  updated_at?: string;
}

interface PaymentListResponse {
  results?: PaymentRecord[];
  [key: string]: unknown;
}

const summarizePayloadShape = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    return { type: typeof payload };
  }

  const record = payload as Record<string, unknown>;
  const topLevelKeys = Object.keys(record);
  const dataKeys =
    record.data && typeof record.data === 'object'
      ? Object.keys(record.data as Record<string, unknown>)
      : [];

  return {
    type: 'object',
    topLevelKeys,
    dataKeys,
    hasApplicationAtRoot: Boolean(record.application),
    hasApplicationInData: Boolean(
      record.data &&
        typeof record.data === 'object' &&
        (record.data as Record<string, unknown>).application
    ),
  };
};

export const extractApplicationFromEnvelope = (
  envelope: unknown,
  endpoint: string
): ApplicationPayload => {
  const record =
    envelope && typeof envelope === 'object'
      ? (envelope as Record<string, unknown>)
      : null;
  const dataRecord =
    record?.data && typeof record.data === 'object'
      ? (record.data as Record<string, unknown>)
      : null;
  const applicationCandidate =
    dataRecord?.application ??
    record?.application ??
    (record && 'application_number' in record ? record : null);
  const application =
    applicationCandidate && typeof applicationCandidate === 'object'
      ? (applicationCandidate as ApplicationPayload)
      : null;

  if (!application || typeof application !== 'object') {
    console.error('[useDocumentGeneration] Malformed payload: missing application object', {
      endpoint,
      responseShape: summarizePayloadShape(envelope),
    });
    throw new Error('No application data received');
  }

  if (!application.application_number || !application.public_tracking_code) {
    console.error('[useDocumentGeneration] Malformed payload: missing required fields', {
      endpoint,
      responseShape: summarizePayloadShape(envelope),
      missingRequiredFields: {
        application_number: !application.application_number,
        public_tracking_code: !application.public_tracking_code,
      },
    });
    throw new Error('Missing required application fields');
  }

  return application;
};

function normalizeAmount(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function fetchSuccessfulPayment(applicationId: string): Promise<PaymentRecord | null> {
  try {
    const data = await apiClient.request<PaymentListResponse | PaymentRecord[]>(
      `/payments/?application_id=${encodeURIComponent(applicationId)}`
    );
    const records = Array.isArray(data) ? data : (data?.results ?? []);
    return records.find(r => r.status === 'successful') ?? records[0] ?? null;
  } catch {
    return null;
  }
}

function buildReceiptData(application: ApplicationPayload, payment: PaymentRecord | null) {
  return {
    receiptNumber: application.receipt_number || generateReceiptNumber(),
    applicationNumber: application.application_number || 'Unknown',
    studentName: application.full_name || 'Applicant',
    email: application.email || 'Not provided',
    phone: application.phone || 'Not provided',
    program: application.program || 'Not specified',
    institution: application.institution || 'MIHAS',
    amount: payment ? normalizeAmount(payment.amount) : normalizeAmount(application.application_fee),
    paymentMethod: payment?.payment_method || 'Online Payment',
    paymentReference: payment?.transaction_reference || undefined,
    paymentDate: payment?.created_at || application.payment_verified_at || new Date().toISOString(),
    verifiedDate: payment?.updated_at || application.payment_verified_at || new Date().toISOString(),
    verifiedBy: application.payment_verified_by_name || 'Admissions Office',
  };
}

export function useDocumentGeneration() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateDocument = async (
    type: 'slip' | 'acceptance' | 'receipt' | 'conditional',
    applicationId: string
  ) => {
    setLoading(true);
    setError(null);

    try {
      logger.info('[useDocumentGeneration] Starting generation for type:', type);

      const detail = await applicationService.getById(applicationId)
      const envelope = detail?.application ?? null;
      const endpoint = `/applications/${applicationId}/details/`;
      const application = extractApplicationFromEnvelope(envelope, endpoint);
      logger.info('[useDocumentGeneration] Application data:', application);

      let pdfBlob: Blob;
      let filename: string;

      switch (type) {
        case 'slip':
          logger.info('[useDocumentGeneration] Generating slip PDF...');
          pdfBlob = await generateApplicationSlip({
            public_tracking_code: application.public_tracking_code ?? '',
            application_number: application.application_number ?? '',
            status: application.status ?? '',
            payment_status: application.payment_status ?? null,
            submitted_at: application.submitted_at ?? null,
            updated_at: application.updated_at ?? null,
            program_name: application.program ?? null,
            intake_name: application.intake ?? null,
            institution: application.institution ?? null,
            full_name: application.full_name ?? null,
            email: application.email ?? '',
            phone: application.phone ?? null,
          });
          logger.info('[useDocumentGeneration] Slip PDF generated successfully');
          filename = `application_slip_${application.application_number}.pdf`;
          break;

        case 'acceptance':
          if (application.status !== 'approved' && application.status !== 'conditionally_approved') {
            throw new Error('Application must be approved to generate acceptance letter');
          }
          pdfBlob = await generateAcceptanceLetter({
            applicationNumber: application.application_number ?? '',
            studentName: application.full_name ?? '',
            program: application.program ?? '',
            institution: application.institution ?? 'MIHAS',
            intake: application.intake ?? '',
            approvedDate: application.updated_at ?? '',
            startDate: application.start_date,
          });
          filename = `acceptance_letter_${application.application_number}.pdf`;
          break;

        case 'conditional':
          if (application.status !== 'conditionally_approved') {
            throw new Error('Application must be conditionally approved');
          }
          pdfBlob = await generateAcceptanceLetter({
            applicationNumber: application.application_number ?? '',
            studentName: application.full_name ?? '',
            program: application.program ?? '',
            institution: application.institution ?? 'MIHAS',
            intake: application.intake ?? '',
            approvedDate: application.updated_at ?? '',
            startDate: application.start_date,
            conditional: true,
            conditions: application.conditions,
          });
          filename = `conditional_acceptance_${application.application_number}.pdf`;
          break;

        case 'receipt':
          if (application.payment_status !== 'verified' && application.payment_status !== 'paid') {
            throw new Error('Payment must be verified to generate receipt');
          }
          {
            const payment = await fetchSuccessfulPayment(applicationId);
            pdfBlob = await generatePaymentReceipt(buildReceiptData(application, payment));
          }
          filename = `receipt_${application.receipt_number || application.application_number || applicationId}.pdf`;
          break;

        default:
          throw new Error('Invalid document type');
      }

      // Download PDF
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate document';
      console.error('[useDocumentGeneration] Error:', err);
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { generateDocument, loading, error };
}
