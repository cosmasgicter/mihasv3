import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import QRCode from 'qrcode';

import { getApiBaseUrl } from './apiConfig';
import { formatDate } from './utils';
import { sanitizeForLog } from './security';
import { supabase } from './supabase';

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

export type ApplicationSlipData = PublicApplicationStatus & { email: string; userId?: string };

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
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not available';
  const datePart = formatDate(parsed);
  const timePart = parsed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return `${datePart} ${timePart}`;
}

function buildTrackingUrl(code: string): string {
  const baseUrl = getApiBaseUrl().replace(/\/$/, '');
  return `${baseUrl}/track-application?code=${encodeURIComponent(code)}`;
}

async function loadImageAsBase64(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Failed to load image:', url, error);
    return '';
  }
}

export async function generateApplicationSlip(data: ApplicationSlipData): Promise<Blob> {
  if (!data || !data.application_number || !data.public_tracking_code) {
    throw new Error('Missing application data for slip generation');
  }

  try {
    const doc = new jsPDF();
    
    // Load logos
    const mihasLogo = await loadImageAsBase64('/images/logos/mihas-logo.png');
    const katcLogo = await loadImageAsBase64('/images/logos/katc-logo.png');
    
    // Header with logos
    doc.setFillColor(14, 165, 233);
    doc.rect(0, 0, 210, 45, 'F');
    
    if (mihasLogo) doc.addImage(mihasLogo, 'PNG', 15, 8, 25, 25);
    if (katcLogo) doc.addImage(katcLogo, 'PNG', 170, 8, 25, 25);
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('Application Received', 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Official Application Slip', 105, 30, { align: 'center' });
    doc.text(data.institution || 'MIHAS', 105, 38, { align: 'center' });
    
    // Content
    doc.setTextColor(75, 85, 99);
    doc.setFontSize(10);
    doc.text('Thank you for submitting your application. We have received the', 14, 55);
    doc.text('details below and will notify you once they have been reviewed.', 14, 61);
    
    (doc as any).autoTable({
      startY: 70,
      head: [],
      body: [
        ['Application number', safeText(data.application_number)],
        ['Tracking code', safeText(data.public_tracking_code)],
        ['Programme', safeText(data.program_name, 'Not specified')],
        ['Submission date', formatDateTime(data.submitted_at)],
        ['Payment status', formatStatusLabel(data.payment_status, 'Pending Review')]
      ],
      theme: 'grid',
      headStyles: { fillColor: [249, 250, 251], textColor: [17, 24, 39] },
      bodyStyles: { textColor: [17, 24, 39] },
      columnStyles: {
        0: { fillColor: [249, 250, 251], fontStyle: 'bold', cellWidth: 60 },
        1: { cellWidth: 'auto' }
      }
    });
    
    let finalY = (doc as any).lastAutoTable.finalY + 10;
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    doc.text('Applicant Information', 14, finalY);
    
    (doc as any).autoTable({
      startY: finalY + 5,
      head: [],
      body: [
        ['Full name', safeText(data.full_name)],
        ['Email', safeText(data.email)],
        ['Phone', safeText(data.phone)]
      ],
      theme: 'grid',
      columnStyles: {
        0: { fillColor: [249, 250, 251], fontStyle: 'bold', cellWidth: 60 },
        1: { cellWidth: 'auto' }
      }
    });
    
    finalY = (doc as any).lastAutoTable.finalY + 10;
    
    doc.setFontSize(9);
    doc.setTextColor(75, 85, 99);
    doc.text('Keep this information for your records. You can use your tracking code to', 14, finalY);
    doc.text('check the status of your application at any time.', 14, finalY + 5);
    
    // QR Code with verification data
    const qrData = JSON.stringify({
      type: 'application_slip',
      app_no: data.application_number,
      tracking: data.public_tracking_code,
      institution: data.institution,
      program: data.program_name,
      verify_url: buildTrackingUrl(data.public_tracking_code)
    });
    const qrDataUrl = await QRCode.toDataURL(qrData, { margin: 1, width: 240, errorCorrectionLevel: 'M' });
    doc.addImage(qrDataUrl, 'PNG', 150, finalY + 10, 40, 40);
    
    doc.setFontSize(8);
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

export async function persistSlip(applicationNumber: string, blob: Blob, userId?: string): Promise<PersistSlipResult> {
  const trimmedNumber = (applicationNumber || '').trim();
  if (!trimmedNumber) {
    return { success: false, error: 'Application number is required to persist slip' };
  }

  try {
    const sanitizedNumber = trimmedNumber.replace(/[^a-zA-Z0-9_-]/g, '-') || 'application';
    const timestamp = Date.now();
    const path = userId 
      ? `${userId}/${sanitizedNumber}/${timestamp}-application-slip.pdf`
      : `public/${sanitizedNumber}/${timestamp}-application-slip.pdf`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('app_docs')
      .upload(path, blob, { contentType: 'application/pdf', upsert: true });

    if (uploadError || !uploadData) {
      if (!userId && uploadError?.message?.includes('policy')) {
        return { success: true, error: 'Slip generated but not stored due to access restrictions' };
      }
      return { success: false, error: uploadError?.message || 'Failed to upload application slip' };
    }

    const { data: urlData } = supabase.storage.from('app_docs').getPublicUrl(uploadData.path);
    const publicUrl = urlData?.publicUrl;
    let documentId: string | undefined;

    try {
      const { data: application } = await supabase
        .from('applications')
        .select('id')
        .eq('application_number', trimmedNumber)
        .maybeSingle();

      if (application?.id) {
        const documentPayload = {
          application_id: application.id,
          document_type: 'application_slip',
          document_name: `Application Slip - ${trimmedNumber}.pdf`,
          file_url: publicUrl || uploadData.path,
          system_generated: true
        };

        const { data: existingDocument } = await supabase
          .from('application_documents')
          .select('id')
          .eq('application_id', application.id)
          .eq('document_type', 'application_slip')
          .maybeSingle();

        if (existingDocument?.id) {
          await supabase
            .from('application_documents')
            .update({ ...documentPayload, updated_at: new Date().toISOString() })
            .eq('id', existingDocument.id);
          documentId = existingDocument.id;
        } else {
          const { data: insertData } = await supabase
            .from('application_documents')
            .insert(documentPayload)
            .select('id')
            .maybeSingle();
          documentId = insertData?.id;
        }
      }
    } catch (dbError) {
      console.error('Database error:', sanitizeForLog(dbError instanceof Error ? dbError.message : String(dbError)));
    }

    return { success: true, path: uploadData.path, publicUrl, documentId };
  } catch (error) {
    console.error('Persist error:', sanitizeForLog(error instanceof Error ? error.message : String(error)));
    return { success: false, error: error instanceof Error ? error.message : 'Failed to persist application slip' };
  }
}
