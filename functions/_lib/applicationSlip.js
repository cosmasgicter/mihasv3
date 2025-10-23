// Re-export from unified template system (jsPDF)
export { generateApplicationSlip, generateAcceptanceLetter, generatePaymentReceipt } from './pdfTemplates.js';

// Legacy export for backwards compatibility
import { generateApplicationSlip as _generateApplicationSlip } from './pdfTemplates.js';

// Default export uses unified system
export default { generateApplicationSlip: _generateApplicationSlip };
