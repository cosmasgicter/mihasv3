export const WIZARD_COPY = {
  keyboardNavigationTip: 'Tip: Use Ctrl+←/→ to navigate steps',
  missingFieldsPrefix: '• Missing:',
  quickTipsTitle: '💡 Quick Tips',
  quickTipsByStep: {
    basicKyc: [
      'Ensure your contact details are accurate',
      'Double-check your NRC/Passport number',
      'Select the correct intake period'
    ],
    education: [
      'Enter at least 5 subject grades',
      'Upload a clear scan of your result slip',
      'Ensure grades match your certificate'
    ],
    payment: [
      'Payment is processed securely via Lenco',
      'Ensure you have a stable internet connection',
      'Your payment status updates automatically'
    ],
    submit: [
      'Review all information carefully',
      'Ensure all documents are uploaded',
      'Accept terms to submit application'
    ]
  }
} as const

export type WizardStepKey = keyof typeof WIZARD_COPY.quickTipsByStep
