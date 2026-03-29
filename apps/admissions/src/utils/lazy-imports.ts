/**
 * Lazy imports for heavy libraries
 * These are loaded on-demand to reduce initial bundle size
 */

// Excel libraries (371 KiB)
export const lazyExcelJS = () => import('exceljs');
export const lazyXLSX = () => import('xlsx');

// PDF libraries (304 KiB)
export const lazyJSPDF = () => import('jspdf');
export const lazyPDFLib = () => import('pdf-lib');
export const lazyJSPDFAutoTable = () => import('jspdf-autotable');

// Charts (only load on dashboard/reports)
export const lazyRecharts = () => import('recharts');

// OCR (only load when scanning documents)
export const lazyTesseract = () => import('tesseract.js');

// Usage example:
// const { default: ExcelJS } = await lazyExcelJS();
// const workbook = new ExcelJS.Workbook();
