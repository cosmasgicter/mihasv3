/**
 * Payment Receipt Hook - Cookie-based authentication
 * 
 * Uses HTTP-only cookies (credentials: 'include') for authentication
 * 
 * @module usePaymentReceipt
 */

import { useState } from 'react';
import { generatePaymentReceipt } from '@/lib/receiptGenerator';
import { getApiBaseUrl } from '@/lib/apiConfig';

export function usePaymentReceipt() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateReceipt = async (applicationId: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${getApiBaseUrl()}/api/payments?action=receipt&applicationId=${applicationId}`,
        {
          method: 'GET',
          credentials: 'include', // CRITICAL: Send HTTP-only cookies
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Please sign in to generate receipt');
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate receipt');
      }

      const { data } = await response.json();

      const pdfBlob = await generatePaymentReceipt(data);

      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `receipt_${data.receiptNumber}.pdf`;
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
