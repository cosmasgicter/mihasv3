/**
 * Payment Receipt Hook - Cookie-based authentication
 * 
 * Uses HTTP-only cookies (credentials: 'include') for authentication
 * 
 * @module usePaymentReceipt
 */

import { useState } from 'react';
import { generatePaymentReceipt, generateReceiptNumber } from '@/lib/receiptGenerator';
import { applicationService } from '@/services/applications';

type ReceiptApplication = {
  application_number?: string | null
  full_name?: string | null
  email?: string | null
  phone?: string | null
  program?: string | null
  institution?: string | null
  amount?: number | string | null
  application_fee?: number | string | null
  payment_method?: string | null
  momo_ref?: string | null
  paid_at?: string | null
  payment_verified_at?: string | null
  payment_verified_by_name?: string | null
  receipt_number?: string | null
}

function normalizeAmount(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function buildReceiptData(application: ReceiptApplication) {
  return {
    receiptNumber: application.receipt_number || generateReceiptNumber(),
    applicationNumber: application.application_number || 'Unknown',
    studentName: application.full_name || 'Applicant',
    email: application.email || 'Not provided',
    phone: application.phone || 'Not provided',
    program: application.program || 'Not specified',
    institution: application.institution || 'MIHAS',
    amount: normalizeAmount(application.amount ?? application.application_fee),
    paymentMethod: application.payment_method || 'Mobile Money',
    paymentReference: application.momo_ref || undefined,
    paymentDate: application.paid_at || application.payment_verified_at || new Date().toISOString(),
    verifiedDate: application.payment_verified_at || new Date().toISOString(),
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

      if (application.payment_status !== 'verified') {
        throw new Error('Payment must be verified before a receipt can be generated')
      }

      const pdfBlob = await generatePaymentReceipt(buildReceiptData(application));

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
