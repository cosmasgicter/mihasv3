/**
 * Payment Receipt Hook
 *
 * Fetches receipt data exclusively from the backend receipt API.
 * PDF is rendered client-side from server-authoritative data only.
 */

import { useState } from 'react';
import { generatePaymentReceipt } from '@/lib/pdf';
import { listPayments, readPaymentReceipt } from '@/services/payments';

/**
 * The row and receipt shapes, and the transports that fetch them, now live in
 * `@/services/payments` (task 13.6 remediation L12). This hook had its own copy of both
 * the list unwrap and the receipt call, reached over the raw client from `src/pages` —
 * which the R14.3 rule forbids and which meant two dev hooks each carried a private
 * reader for the same two endpoints.
 */
async function findSuccessfulPaymentId(applicationId: string): Promise<string | null> {
  try {
    const records = await listPayments({ applicationId })
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

      const receipt = await readPaymentReceipt(paymentId)
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
        institution: 'Beanola Admissions',
        amount: Number(receipt.amount) || 0,
        currency: receipt.currency === 'USD' ? 'USD' as const : 'ZMW' as const,
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
