/**
 * Payment Receipt Hook - Cookie-based authentication
 *
 * Fetches receipt data from the backend receipt API instead of
 * fabricating it client-side. Falls back to payment record fields
 * if the receipt endpoint is unavailable.
 *
 * @module usePaymentReceipt
 * @requirements 2.7
 */

import { useState } from 'react';
import { generatePaymentReceipt } from '@/lib/receiptGenerator';
import { apiClient } from '@/services/client';

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

async function fetchReceiptData(paymentId: string): Promise<BackendReceiptData | null> {
  try {
    return await apiClient.request<BackendReceiptData>(`/payments/${encodeURIComponent(paymentId)}/receipt/`)
  } catch {
    return null
  }
}

function buildReceiptFromBackend(receipt: BackendReceiptData, payment: PaymentRecord) {
  return {
    receiptNumber: receipt.payment_id.slice(0, 8).toUpperCase(),
    applicationNumber: receipt.application_number || 'Unknown',
    studentName: receipt.applicant_name || 'Applicant',
    email: '',
    phone: '',
    program: receipt.program || 'Not specified',
    institution: 'MIHAS',
    amount: Number(receipt.amount) || 0,
    paymentMethod: payment.payment_method || 'Online Payment',
    paymentReference: payment.transaction_reference || undefined,
    paymentDate: receipt.created_at || new Date().toISOString(),
    verifiedDate: receipt.created_at || new Date().toISOString(),
    verifiedBy: 'Admissions Office',
  }
}

function buildReceiptFromPayment(payment: PaymentRecord) {
  const now = new Date().toISOString()
  return {
    receiptNumber: payment.id.slice(0, 8).toUpperCase(),
    applicationNumber: 'Unknown',
    studentName: 'Applicant',
    email: '',
    phone: '',
    program: 'Not specified',
    institution: 'MIHAS',
    amount: typeof payment.amount === 'number' ? payment.amount : 0,
    paymentMethod: payment.payment_method || 'Online Payment',
    paymentReference: payment.transaction_reference || undefined,
    paymentDate: payment.created_at || now,
    verifiedDate: payment.updated_at || payment.created_at || now,
    verifiedBy: 'Admissions Office',
  }
}

export function usePaymentReceipt() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateReceipt = async (applicationId: string) => {
    setLoading(true);
    setError(null);

    try {
      const payment = await fetchSuccessfulPayment(applicationId)
      if (!payment) {
        throw new Error('No payment record found for this application')
      }

      const receipt = await fetchReceiptData(payment.id)
      const receiptInput = receipt
        ? buildReceiptFromBackend(receipt, payment)
        : buildReceiptFromPayment(payment)

      const pdfBlob = await generatePaymentReceipt(receiptInput);

      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `receipt_${receipt?.application_number || applicationId}.pdf`;
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
