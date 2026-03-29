export const PAYMENT_CONFIG = {
  DEFAULT_AMOUNT: 153,
  MIN_AMOUNT: 153,
  CURRENCY: 'ZMW',
  PAYMENT_METHODS: ['MTN Money', 'Airtel Money', 'Zamtel Money', 'Bank Transfer'] as const,
  
  // Institution-specific payment targets
  PAYMENT_TARGETS: {
    KATC: {
      name: 'KATC',
      mtn: '0966 992 299',
      airtel: '0977 000 000',
      zamtel: '0955 000 000'
    },
    MIHAS: {
      name: 'MIHAS',
      mtn: '0961 515 151',
      airtel: '0977 000 001',
      zamtel: '0955 000 001'
    }
  } as const
}

export type PaymentMethod = typeof PAYMENT_CONFIG.PAYMENT_METHODS[number]
export type InstitutionCode = keyof typeof PAYMENT_CONFIG.PAYMENT_TARGETS
