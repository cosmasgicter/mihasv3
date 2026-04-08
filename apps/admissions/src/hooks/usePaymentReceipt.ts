/**
 * Payment Receipt Hook - Cookie-based authentication
 * 
 * Uses HTTP-only cookies (credentials: 'include') for authentication.
 * Reads payment data from the `payments` table instead of deprecated
 * Application model fields.
 *
 * @module usePaymentReceipt
 * @requirements 2.7
 */

import { useState } from 'react';
import { generatePaymentReceipt, generateReceiptNumber } from '@/lib/receiptGenerator';
import { applicationService } from '@/services/applications';
import { apiClient } from '@/services/client';

type ReceiptApplication = {
  application_number?: string | null
  full_name?: string | null
  email?: string | null
  phone?: string | null
  program?: string | null
  institution?: string | null
  application_fee?: number | string | null
  payment_verified_by_name?: string | null
  receipt_number?: string | null
}

interface PaymentRecord {
  id: string
  status: string
  amount: number | null
  currency: string | null
  payment_method?: string | null
  transaction_reference?: string | null
  created_at: string
  updated_at?: string
}

interface PaymentListResponse {
  results?: PaymentRecord[]
  [key: string]: unknown
}

function normalizeAmount(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

async function fetchSuccessfulPayment(applicationId: string): Promise<PaymentRecord | null> {
  try {
    const data = await apiClient.request<PaymentListResponse | PaymentRecord[]>(
      `/payments/?application_id=${encodeURIComponent(applicationId)}`
    )
    const records = Array.isArray(data) ? data : (data?.results ?? [])
    return records.find(r => r.status === 'successful') ?? records[0] ?? null
  } catch {
    return null
  }
}

function buildReceiptData(application: ReceiptApplication, payment: PaymentRecord | null) {
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
    paymentDate: payment?.created_at || new Date().toISOString(),
    verifiedDate: payment?.updated_at || payment?.created_at || new Date().toISOString(),
    verifiedBy: application.payment_verified_by_name || 'Admissions Office',
  }
}

export function usePaymentReceipt() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateReceipt = async (applicationId: string) => {
    setLoading(true);
    setError(null);

    try {
      const detail = await applicationService.getById(applicationId)
      const application = detail?.application

      if (!application) {
        throw new Error('Application details are unavailable')
      }

      const pStatus = application.payment_status
      if (pStatus !== 'verified' && pStatus !== 'paid') {
        throw new Error('Payment must be verified before a receipt can be generated')
      }

      const payment = await fetchSuccessfulPayment(applicationId)

      const pdfBlob = await generatePaymentReceipt(buildReceiptData(application, payment));

      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `receipt_${application.receipt_number || application.application_number || applicationId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate receipt';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { generateReceipt, loading, error };
}
