/**
 * Payment Receipt Hook
 *
 * Fetches receipt data exclusively from the backend receipt API.
 * PDF is rendered client-side from server-authoritative data only.
 */

import { useState } from 'react';
import { generatePaymentReceipt } from '@/lib/pdf';
import { apiClient } from '@/services/client';

interface PaymentRecord {
  id: string
  status: string
}

interface PaymentListResponse {
  results?: PaymentRecord[]
  [key: string]: unknown
}

interface BackendReceiptData {
  payment_id: string
  amount: string
  currency: string
  status: string
  created_at: string | null
  application_number: string | null
  program: string | null
  applicant_name: string | null
}

async function findSuccessfulPaymentId(applicationId: string): Promise<string | null> {
  try {
    const data = await apiClient.request<PaymentListResponse | PaymentRecord[]>(
      `/payments/?application_id=${encodeURIComponent(applicationId)}`
    )
    const records = Array.isArray(data) ? data : (data?.results ?? [])
    const successful = records.find(r => r.status === 'successful')
    return successful?.id ?? records[0]?.id ?? null
  } catch {
    return null
  }
}

export function usePaymentReceipt() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateReceipt = async (applicationId: string) => {
    setLoading(true);
    setError(null);

    try {
      const paymentId = await findSuccessfulPaymentId(applicationId)
      if (!paymentId) throw new Error('No payment record found for this application')

      const receipt = await apiClient.request<BackendReceiptData>(
        `/payments/${encodeURIComponent(paymentId)}/receipt/`
      )
      if (!receipt) throw new Error('Receipt data unavailable')

      // Yield to browser before CPU-intensive PDF work
      await new Promise(r => setTimeout(r, 0));

      const pdfBlob = await generatePaymentReceipt({
        receiptNumber: receipt.payment_id.slice(0, 8).toUpperCase(),
        applicationNumber: receipt.application_number || 'Unknown',
        studentName: receipt.applicant_name || 'Applicant',
        email: '',
        phone: '',
        program: receipt.program || 'Not specified',
        institution: 'MIHAS',
        amount: Number(receipt.amount) || 0,
        paymentMethod: 'Online Payment',
        paymentDate: receipt.created_at || new Date().toISOString(),
        verifiedDate: receipt.created_at || new Date().toISOString(),
        verifiedBy: 'Admissions Office',
      });

      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `receipt_${receipt.application_number || applicationId}.pdf`;
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
