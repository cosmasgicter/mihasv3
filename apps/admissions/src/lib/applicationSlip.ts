// Dynamic imports for PDF generation (loaded on-demand)
import QRCode from 'qrcode';

import { getApiBaseUrl } from './apiConfig';
import { formatTimestamp } from './dateFormat';
import { sanitizeForLog } from './security';
import { apiClient } from '@/services/client';

export interface PublicApplicationStatus {
  public_tracking_code: string;
  application_number: string;
  status: string;
  payment_status: string | null;
  submitted_at: string | null;
  updated_at: string | null;
  program_name: string | null;
  intake_name: string | null;
  institution: string | null;
  institution_name?: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  nationality?: string | null;
  admin_feedback?: string | null;
  admin_feedback_date?: string | null;
}

export type ApplicationSlipData = PublicApplicationStatus & {
  email: string;
  userId?: string;
  application_id?: string;
  slip_url?: string;
  slip_document_reference?: string;
};

export interface PersistSlipResult {
  success: boolean;
  path?: string;
  publicUrl?: string;
  documentId?: string;
  error?: string;
}

function safeText(value: string | null | undefined, fallback = 'Not provided'): string {
  if (!value) return fallback;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

function formatStatusLabel(value: string | null | undefined, fallback = 'Unknown'): string {
  const sanitized = safeText(value, fallback);
  if (sanitized === fallback) return fallback;
  return sanitized.split(/[_-]/).map(part => part ? part.charAt(0).toUpperCase() + part.slice(1) : part).join(' ');
}

function formatDateTime(value?: string | null): string {
  if (!value) return 'Not available';
  return formatTimestamp(value);
}

function buildTrackingUrl(code: string): string {
  const baseUrl = getApiBaseUrl().replace(/\/$/, '');
  return `${baseUrl}/track-application?code=${encodeURIComponent(code)}`;
}

function getFullInstitutionName(code: string | null | undefined): string {
  const names: Record<string, string> = {
    'KATC': 'Kalulushi Training Centre',
    'MIHAS': 'Mukuba Institute of Health and Allied Sciences'
  };
  return names[code || ''] || code || 'MIHAS';
}

export async function generateApplicationSlip(data: ApplicationSlipData): Promise<Blob> {
  if (!data || !data.application_number || !data.public_tracking_code) {
    throw new Error('Missing application data for slip generation');
  }

  try {
    // Dynamic import - only load when generating slip
    const [{ jsPDF }, autoTable] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable').then(m => m.default)
    ]);
    // jspdf-autotable adds lastAutoTable to the doc instance at runtime
    const doc = new jsPDF() as InstanceType<typeof jsPDF> & { lastAutoTable?: { finalY: number } };
    const institutionName = getFullInstitutionName(data.institution);
    
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFillColor(14, 165, 233);
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(institutionName, pageWidth / 2, 15, { align: 'center' });
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text('Application Slip', pageWidth / 2, 28, { align: 'center' });
    
    // Date and Status
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`Date: ${formatDateTime(data.submitted_at)}`, pageWidth - 20, 50, { align: 'right' });
    
    // Line separator
    doc.setLineWidth(0.5);
    doc.line(20, 55, pageWidth - 20, 55);
    
    // Introduction
    let y = 65;
    doc.setFontSize(10);
    doc.setTextColor(75, 85, 99);
    doc.text('Thank you for submitting your application. Below are your application details.', 20, y);
    doc.text('Please keep this slip for your records.', 20, y + 5);
    
    // Application Details Section
    y += 15;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('APPLICATION DETAILS', 20, y);
    
    autoTable(doc, {
      startY: y + 5,
      head: [],
      body: [
        ['Application Number', safeText(data.application_number)],
        ['Tracking Code', safeText(data.public_tracking_code)],
        ['Programme', safeText(data.program_name, 'Not specified')],
        ['Intake', safeText(data.intake_name, 'Not specified')],
        ['Institution', institutionName],
        ['Application Status', formatStatusLabel(data.status, 'Pending')],
        ['Payment Status', formatStatusLabel(data.payment_status, 'Pending Payment')]
      ],
      theme: 'striped',
      headStyles: { fillColor: [249, 250, 251], textColor: [17, 24, 39] },
      bodyStyles: { textColor: [17, 24, 39], fontSize: 10 },
      columnStyles: {
        0: { fillColor: [249, 250, 251], fontStyle: 'bold', cellWidth: 60 },
        1: { cellWidth: 'auto' }
      }
    });
    
    let finalY = (doc.lastAutoTable?.finalY ?? 0) + 12;
    
    // Applicant Information Section
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('APPLICANT INFORMATION', 20, finalY);
    
    autoTable(doc, {
      startY: finalY + 5,
      head: [],
      body: [
        ['Full Name', safeText(data.full_name)],
        ['Email', safeText(data.email)],
        ['Phone', safeText(data.phone)],
        ['Nationality', safeText(data.nationality, 'Not provided')]
      ],
      theme: 'striped',
      bodyStyles: { textColor: [17, 24, 39], fontSize: 10 },
      columnStyles: {
        0: { fillColor: [249, 250, 251], fontStyle: 'bold', cellWidth: 60 },
        1: { cellWidth: 'auto' }
      }
    });
    
    finalY = (doc.lastAutoTable?.finalY ?? 0) + 12;
    
    // Important Notice
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('IMPORTANT NOTICE', 20, finalY);
    
    finalY += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(75, 85, 99);
    const notices = [
      '• Keep this slip safe for your records',
      '• Use your tracking code to check application status online',
      '• You will be notified via email once your application is reviewed',
      '• For inquiries, contact: ***REMOVED***'
    ];
    notices.forEach(notice => {
      doc.text(notice, 20, finalY);
      finalY += 5;
    });
    
    // QR Code with verification data
    const qrData = JSON.stringify({
      type: 'application_slip',
      app_no: data.application_number,
      tracking: data.public_tracking_code,
      institution: data.institution,
      program: data.program_name,
      student: data.full_name
    });
    const qrDataUrl = await QRCode.toDataURL(qrData, { margin: 1, width: 240, errorCorrectionLevel: 'M' });
    doc.addImage(qrDataUrl, 'PNG', 150, finalY + 10, 40, 40);
    
    doc.setFontSize(7);
    doc.setTextColor(107, 114, 128);
    doc.text('Scan to verify', 170, finalY + 55, { align: 'center' });
    
    // Footer
    doc.setFillColor(249, 250, 251);
    doc.rect(0, 282, 210, 15, 'F');
    
    doc.setTextColor(75, 85, 99);
    doc.setFontSize(8);
    const year = new Date().getFullYear();
    doc.text(`© ${year} MIHAS. All rights reserved.`, 105, 289, { align: 'center' });
    doc.text(`Generated: ${formatDateTime(new Date().toISOString())}`, 105, 294, { align: 'center' });
    
    const pdfBlob = doc.output('blob');
    return new Blob([pdfBlob], { type: 'application/pdf' });
  } catch (error) {
    console.error('Failed to generate application slip:', sanitizeForLog(error instanceof Error ? error.message : String(error)));
    throw error;
  }
}

type UploadedSlipDocument = {
  id: string;
  file_url?: string;
  document_name?: string;
};

type ApplicationDocumentReference = {
  id?: string;
  file_url?: string;
  document_name?: string;
};

async function uploadSlipViaDocumentsApi(applicationId: string, applicationNumber: string, blob: Blob) {
  const fileName = `application-slip-${applicationNumber}.pdf`;
  const formData = new FormData();
  formData.append('file', blob, fileName);
  formData.append('application_id', applicationId);
  formData.append('document_type', 'application_slip');

  return apiClient.request<UploadedSlipDocument>('/documents/upload/', {
    method: 'POST',
    body: formData,
  });
}

export async function repairLegacyDocumentReference(reference: string, applicationId?: string): Promise<{ publicUrl?: string; path?: string }> {
  if (!reference?.trim()) {
    return {};
  }

  if (/^https?:\/\//.test(reference)) {
    return { publicUrl: reference, path: reference };
  }

  if (!applicationId) {
    return {};
  }

  try {
    const documents = await apiClient.request<ApplicationDocumentReference[]>(
      `/applications/${encodeURIComponent(applicationId)}/documents`
    );
    const normalizedReference = reference.trim();
    const resolved = documents?.find((document) =>
      document?.id === normalizedReference ||
      document?.document_name === normalizedReference ||
      document?.file_url === normalizedReference
    );

    return {
      publicUrl: resolved?.file_url,
      path: resolved?.id || resolved?.document_name,
    };
  } catch (error) {
    console.error('Failed to resolve legacy document reference:', sanitizeForLog(error instanceof Error ? error.message : String(error)));
    return {};
  }
}

export async function persistSlip(
  applicationNumber: string,
  blob: Blob,
  userId?: string,
  applicationId?: string
): Promise<PersistSlipResult> {
  const trimmedNumber = (applicationNumber || '').trim();
  void userId;
  if (!trimmedNumber) {
    return { success: false, error: 'Application number is required to persist slip' };
  }

  if (!applicationId?.trim()) {
    return {
      success: false,
      error: 'Automatic slip storage requires a saved application record',
    };
  }

  try {
    const uploadResult = await uploadSlipViaDocumentsApi(applicationId, trimmedNumber, blob);

    if (!uploadResult?.id || !uploadResult.file_url) {
      return { success: false, error: 'Failed to upload application slip' };
    }

    return {
      success: true,
      path: uploadResult.id,
      publicUrl: uploadResult.file_url,
      documentId: uploadResult.id,
    };
  } catch (error) {
    console.error('Persist error:', sanitizeForLog(error instanceof Error ? error.message : String(error)));
    return { success: false, error: error instanceof Error ? error.message : 'Failed to persist application slip' };
  }
}
