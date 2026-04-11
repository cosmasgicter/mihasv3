export const WIZARD_COPY = {
  keyboardNavigationTip: 'Ctrl+←/→ navigates steps',
  missingFieldsPrefix: 'Missing:',
  quickTipsTitle: 'Step notes',
  quickTipsByStep: {
    basicKyc: [
      'Contact details',
      'Programme and intake'
    ],
    education: [
      'At least 5 subjects',
      'Result slip and NRC/passport'
    ],
    payment: [
      'Lenco payment',
      'Automatic status check'
    ],
    submit: [
      'Final review',
      'Submit application'
    ]
  }
} as const

export type WizardStepKey = keyof typeof WIZARD_COPY.quickTipsByStep
