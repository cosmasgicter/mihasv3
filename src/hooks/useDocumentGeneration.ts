/**
 * Document Generation Hook - Cookie-based authentication
 * 
 * Uses HTTP-only cookies (credentials: 'include') for authentication
 * 
 * @module useDocumentGeneration
 */

import { useState } from 'react';
import { logger } from '@/lib/logger';
import { generateApplicationSlip } from '@/lib/applicationSlip';
import { generateAcceptanceLetter } from '@/lib/acceptanceLetterGenerator';
import { generatePaymentReceipt } from '@/lib/receiptGenerator';
import { getApiBaseUrl } from '@/lib/apiConfig';

type ApplicationPayload = {
  application_number?: string;
  public_tracking_code?: string;
  status?: string;
  payment_status?: string;
  submitted_at?: string;
  updated_at?: string;
  program?: string;
  intake?: string;
  institution?: string;
  full_name?: string;
  email?: string;
  phone?: string;
};

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
  const parsedEnvelope = envelope as
    | { data?: { application?: ApplicationPayload }; application?: ApplicationPayload }
    | null
    | undefined;
  const application =
    parsedEnvelope?.data?.application ?? parsedEnvelope?.application ?? null;

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

export function useDocumentGeneration() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateDocument = async (
    type: 'slip' | 'acceptance' | 'receipt',
    applicationId: string
  ) => {
    setLoading(true);
    setError(null);

    try {
      logger.log('[useDocumentGeneration] Starting generation for type:', type);

      // Fetch application data using cookie auth
      const endpoint = `${getApiBaseUrl()}/api/applications?id=${applicationId}`;
      const response = await fetch(endpoint, {
        method: 'GET',
        credentials: 'include', // CRITICAL: Send HTTP-only cookies
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Please sign in to generate documents');
        }
        throw new Error('Failed to fetch application data');
      }

      const envelope = await response.json();
      const application = extractApplicationFromEnvelope(envelope, endpoint);
      logger.log('[useDocumentGeneration] Application data:', application);

      let pdfBlob: Blob;
      let filename: string;

      switch (type) {
        case 'slip':
          logger.log('[useDocumentGeneration] Generating slip PDF...');
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
          logger.log('[useDocumentGeneration] Slip PDF generated successfully');
          filename = `application_slip_${application.application_number}.pdf`;
          break;

        case 'acceptance':
          if (application.status !== 'approved') {
            throw new Error('Application must be approved to generate acceptance letter');
          }
          pdfBlob = await generateAcceptanceLetter({
            applicationNumber: application.application_number ?? '',
            studentName: application.full_name ?? '',
            program: application.program ?? '',
            institution: application.institution ?? 'MIHAS',
            intake: application.intake ?? '',
            approvedDate: application.updated_at ?? '',
          });
          filename = `acceptance_letter_${application.application_number}.pdf`;
          break;

        case 'receipt':
          if (application.payment_status !== 'verified') {
            throw new Error('Payment must be verified to generate receipt');
          }

          // Fetch receipt data using cookie auth
          const receiptResponse = await fetch(
            `${getApiBaseUrl()}/api/payments?action=receipt&applicationId=${applicationId}`,
            {
              method: 'GET',
              credentials: 'include', // CRITICAL: Send HTTP-only cookies
              headers: {
                'Content-Type': 'application/json',
              },
            }
          );

          if (!receiptResponse.ok) {
            throw new Error('Failed to fetch receipt data');
          }

          const { data: receiptData } = await receiptResponse.json();
          pdfBlob = await generatePaymentReceipt(receiptData);
          filename = `receipt_${receiptData.receiptNumber}.pdf`;
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
