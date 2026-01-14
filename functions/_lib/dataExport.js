/**
 * Secure Multi-Format Data Export Library
 * Provides secure data export in PDF, Excel, and CSV formats
 * with access controls, audit logging, and data anonymization
 * 
 * Requirements: 5.5 - Secure multi-format data export
 */

import { supabaseAdminClient } from './supabaseClient.js';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';

/**
 * Export configuration
 */
const EXPORT_CONFIG = {
  maxRecords: 10000, // Maximum records per export
  allowedFormats: ['pdf', 'excel', 'csv'],
  anonymizableFields: ['email', 'phone', 'nrc', 'date_of_birth', 'address'],
  sensitiveFields: ['password', 'token', 'secret', 'api_key']
};

/**
 * Export data in specified format
 */
export async function exportData({
  data,
  format,
  filename,
  columns,
  title,
  anonymize = false,
  userId,
  exportType,
  metadata = {}
}) {
  // Validate format
  if (!EXPORT_CONFIG.allowedFormats.includes(format)) {
    throw new Error(`Invalid format. Must be one of: ${EXPORT_CONFIG.allowedFormats.join(', ')}`);
  }

  // Validate data size
  if (data.length > EXPORT_CONFIG.maxRecords) {
    throw new Error(`Export exceeds maximum allowed records (${EXPORT_CONFIG.maxRecords})`);
  }

  // Remove sensitive fields
  const sanitizedData = removeSensitiveFields(data);

  // Apply anonymization if requested
  const processedData = anonymize ? anonymizeData(sanitizedData) : sanitizedData;

  // Generate export based on format
  let exportResult;
  switch (format) {
    case 'pdf':
      exportResult = await exportToPDF(processedData, columns, title, filename);
      break;
    case 'excel':
      exportResult = await exportToExcel(processedData, columns, title, filename);
      break;
    case 'csv':
      exportResult = await exportToCSV(processedData, columns, filename);
      break;
    default:
      throw new Error('Unsupported format');
  }

  // Create audit log entry
  await createExportAuditLog({
    userId,
    exportType,
    format,
    recordCount: data.length,
    anonymized: anonymize,
    filename,
    metadata
  });

  return exportResult;
}

/**
 * Export data to PDF format
 */
async function exportToPDF(data, columns, title, filename) {
  const doc = new jsPDF();
  
  // Add title
  doc.setFontSize(16);
  doc.text(title || 'Data Export', 14, 20);
  
  // Add metadata
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
  doc.text(`Records: ${data.length}`, 14, 34);
  
  // Prepare table data
  const headers = columns.map(col => col.label || col.key);
  const rows = data.map(row => 
    columns.map(col => {
      const value = row[col.key];
      return formatCellValue(value);
    })
  );
  
  // Add table
  doc.autoTable({
    head: [headers],
    body: rows,
    startY: 40,
    styles: {
      fontSize: 8,
      cellPadding: 2
    },
    headStyles: {
      fillColor: [41, 128, 185],
      textColor: 255,
      fontStyle: 'bold'
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245]
    },
    margin: { top: 40 }
  });
  
  // Add footer with page numbers
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(
      `Page ${i} of ${pageCount}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }
  
  // Generate buffer
  const pdfBuffer = doc.output('arraybuffer');
  
  return {
    buffer: pdfBuffer,
    mimeType: 'application/pdf',
    filename: filename || `export-${Date.now()}.pdf`,
    size: pdfBuffer.byteLength
  };
}

/**
 * Export data to Excel format
 */
async function exportToExcel(data, columns, title, filename) {
  // Create workbook
  const workbook = XLSX.utils.book_new();
  
  // Prepare data with headers
  const headers = columns.map(col => col.label || col.key);
  const rows = data.map(row => 
    columns.map(col => formatCellValue(row[col.key]))
  );
  
  // Create worksheet
  const worksheetData = [headers, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  
  // Set column widths
  const columnWidths = columns.map(col => ({
    wch: Math.max(
      (col.label || col.key).length,
      ...data.map(row => String(row[col.key] || '').length)
    )
  }));
  worksheet['!cols'] = columnWidths;
  
  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, title || 'Data Export');
  
  // Add metadata sheet
  const metadataSheet = XLSX.utils.aoa_to_sheet([
    ['Export Information'],
    ['Generated', new Date().toLocaleString()],
    ['Records', data.length],
    ['Columns', columns.length]
  ]);
  XLSX.utils.book_append_sheet(workbook, metadataSheet, 'Metadata');
  
  // Generate buffer
  const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  
  return {
    buffer: excelBuffer,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: filename || `export-${Date.now()}.xlsx`,
    size: excelBuffer.byteLength
  };
}

/**
 * Export data to CSV format
 */
async function exportToCSV(data, columns, filename) {
  // Prepare headers
  const headers = columns.map(col => col.label || col.key);
  
  // Prepare rows
  const rows = data.map(row => 
    columns.map(col => {
      const value = formatCellValue(row[col.key]);
      // Escape quotes and wrap in quotes if contains comma or quote
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    })
  );
  
  // Combine into CSV
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');
  
  // Convert to buffer
  const csvBuffer = Buffer.from(csvContent, 'utf-8');
  
  return {
    buffer: csvBuffer,
    mimeType: 'text/csv',
    filename: filename || `export-${Date.now()}.csv`,
    size: csvBuffer.byteLength
  };
}

/**
 * Remove sensitive fields from data
 */
function removeSensitiveFields(data) {
  return data.map(row => {
    const sanitized = { ...row };
    EXPORT_CONFIG.sensitiveFields.forEach(field => {
      if (field in sanitized) {
        delete sanitized[field];
      }
    });
    return sanitized;
  });
}

/**
 * Anonymize sensitive data
 */
function anonymizeData(data) {
  return data.map(row => {
    const anonymized = { ...row };
    
    EXPORT_CONFIG.anonymizableFields.forEach(field => {
      if (field in anonymized && anonymized[field]) {
        anonymized[field] = anonymizeField(field, anonymized[field]);
      }
    });
    
    return anonymized;
  });
}

/**
 * Anonymize individual field based on type
 */
function anonymizeField(fieldName, value) {
  if (!value) return value;
  
  switch (fieldName) {
    case 'email':
      // Keep first letter and domain, mask middle
      const emailParts = value.split('@');
      if (emailParts.length === 2) {
        const username = emailParts[0];
        const masked = username[0] + '*'.repeat(Math.max(username.length - 1, 3)) + '@' + emailParts[1];
        return masked;
      }
      return '***@***.***';
      
    case 'phone':
      // Keep country code and last 2 digits
      const phoneStr = String(value);
      if (phoneStr.length > 4) {
        return phoneStr.substring(0, 3) + '*'.repeat(phoneStr.length - 5) + phoneStr.substring(phoneStr.length - 2);
      }
      return '***';
      
    case 'nrc':
      // Mask middle digits
      const nrcStr = String(value);
      if (nrcStr.length > 4) {
        return nrcStr.substring(0, 2) + '*'.repeat(nrcStr.length - 4) + nrcStr.substring(nrcStr.length - 2);
      }
      return '***';
      
    case 'date_of_birth':
      // Keep only year
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return `${date.getFullYear()}-**-**`;
      }
      return '****-**-**';
      
    case 'address':
      // Keep only city/province
      const addressParts = String(value).split(',');
      if (addressParts.length > 1) {
        return '*** ' + addressParts[addressParts.length - 1].trim();
      }
      return '***';
      
    default:
      return '***';
  }
}

/**
 * Format cell value for export
 */
function formatCellValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  
  if (value instanceof Date) {
    return value.toLocaleString();
  }
  
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  
  return String(value);
}

/**
 * Create audit log entry for export
 */
async function createExportAuditLog({
  userId,
  exportType,
  format,
  recordCount,
  anonymized,
  filename,
  metadata
}) {
  try {
    await supabaseAdminClient
      .from('data_export_audit_log')
      .insert([{
        user_id: userId,
        export_type: exportType,
        format,
        record_count: recordCount,
        anonymized,
        filename,
        metadata,
        exported_at: new Date().toISOString()
      }]);
  } catch (error) {
    console.error('Failed to create export audit log:', error);
    // Don't throw - audit logging failure shouldn't prevent export
  }
}

/**
 * Get export history for a user
 */
export async function getExportHistory(userId, limit = 50) {
  const { data, error } = await supabaseAdminClient
    .from('data_export_audit_log')
    .select('*')
    .eq('user_id', userId)
    .order('exported_at', { ascending: false })
    .limit(limit);
  
  if (error) {
    throw new Error(`Failed to fetch export history: ${error.message}`);
  }
  
  return data;
}

/**
 * Validate export permissions
 */
export async function validateExportPermissions(userId, exportType) {
  // Get user role
  const { data: profile, error } = await supabaseAdminClient
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  
  if (error || !profile) {
    return { allowed: false, reason: 'User not found' };
  }
  
  // Define export permissions by role
  const permissions = {
    super_admin: ['applications', 'users', 'compliance', 'analytics', 'all'],
    admin: ['applications', 'compliance', 'analytics'],
    student: ['own_data']
  };
  
  const userPermissions = permissions[profile.role] || [];
  
  if (userPermissions.includes('all') || userPermissions.includes(exportType)) {
    return { allowed: true };
  }
  
  return { 
    allowed: false, 
    reason: `Insufficient permissions for ${exportType} export` 
  };
}

/**
 * Export applications data
 */
export async function exportApplications({
  userId,
  format,
  filters = {},
  anonymize = false
}) {
  // Validate permissions
  const permission = await validateExportPermissions(userId, 'applications');
  if (!permission.allowed) {
    throw new Error(permission.reason);
  }
  
  // Build query
  let query = supabaseAdminClient
    .from('applications')
    .select(`
      id,
      application_number,
      full_name,
      program,
      status,
      eligibility_status,
      eligibility_score,
      created_at,
      submitted_at,
      decision_date
    `);
  
  // Apply filters
  if (filters.program) {
    query = query.eq('program', filters.program);
  }
  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.startDate) {
    query = query.gte('created_at', filters.startDate);
  }
  if (filters.endDate) {
    query = query.lte('created_at', filters.endDate);
  }
  
  // Execute query
  const { data, error } = await query.limit(EXPORT_CONFIG.maxRecords);
  
  if (error) {
    throw new Error(`Failed to fetch applications: ${error.message}`);
  }
  
  // Define columns
  const columns = [
    { key: 'application_number', label: 'Application Number' },
    { key: 'full_name', label: 'Full Name' },
    { key: 'program', label: 'Program' },
    { key: 'status', label: 'Status' },
    { key: 'eligibility_status', label: 'Eligibility Status' },
    { key: 'eligibility_score', label: 'Eligibility Score' },
    { key: 'created_at', label: 'Created At' },
    { key: 'submitted_at', label: 'Submitted At' },
    { key: 'decision_date', label: 'Decision Date' }
  ];
  
  // Export data
  return await exportData({
    data,
    format,
    filename: `applications-export-${Date.now()}`,
    columns,
    title: 'Applications Export',
    anonymize,
    userId,
    exportType: 'applications',
    metadata: { filters }
  });
}

/**
 * Export compliance report data
 */
export async function exportComplianceReport({
  userId,
  reportId,
  format,
  anonymize = false
}) {
  // Validate permissions
  const permission = await validateExportPermissions(userId, 'compliance');
  if (!permission.allowed) {
    throw new Error(permission.reason);
  }
  
  // Get compliance report
  const { data: report, error } = await supabaseAdminClient
    .from('compliance_reports')
    .select('*')
    .eq('id', reportId)
    .single();
  
  if (error || !report) {
    throw new Error('Compliance report not found');
  }
  
  // Flatten report data for export
  const exportData = flattenComplianceReport(report);
  
  // Define columns based on regulatory body
  const columns = getComplianceReportColumns(report.regulatory_body);
  
  // Export data
  return await exportData({
    data: exportData,
    format,
    filename: `compliance-report-${report.regulatory_body}-${Date.now()}`,
    columns,
    title: `${report.regulatory_body} Compliance Report`,
    anonymize,
    userId,
    exportType: 'compliance',
    metadata: { reportId, regulatoryBody: report.regulatory_body }
  });
}

/**
 * Flatten compliance report for export
 */
function flattenComplianceReport(report) {
  const flattened = [];
  
  // Add report metadata
  flattened.push({
    section: 'Report Information',
    field: 'Title',
    value: report.title
  });
  flattened.push({
    section: 'Report Information',
    field: 'Regulatory Body',
    value: report.regulatory_body
  });
  flattened.push({
    section: 'Report Information',
    field: 'Report Type',
    value: report.report_type
  });
  flattened.push({
    section: 'Report Information',
    field: 'Generated At',
    value: report.generated_at
  });
  
  // Add data sections based on structure
  if (report.data) {
    Object.entries(report.data).forEach(([section, sectionData]) => {
      if (Array.isArray(sectionData)) {
        sectionData.forEach((item, index) => {
          Object.entries(item).forEach(([field, value]) => {
            flattened.push({
              section: `${section} [${index + 1}]`,
              field,
              value: formatCellValue(value)
            });
          });
        });
      } else if (typeof sectionData === 'object') {
        Object.entries(sectionData).forEach(([field, value]) => {
          flattened.push({
            section,
            field,
            value: formatCellValue(value)
          });
        });
      }
    });
  }
  
  return flattened;
}

/**
 * Get columns for compliance report export
 */
function getComplianceReportColumns(regulatoryBody) {
  return [
    { key: 'section', label: 'Section' },
    { key: 'field', label: 'Field' },
    { key: 'value', label: 'Value' }
  ];
}

export {
  EXPORT_CONFIG,
  exportToPDF,
  exportToExcel,
  exportToCSV,
  removeSensitiveFields,
  anonymizeData
};
