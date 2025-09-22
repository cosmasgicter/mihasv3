// Secure application number generator with institution prefixes

export interface ApplicationNumberConfig {
  institution: 'MIHAS' | 'KATC'
  year?: number
}

export const generateApplicationNumber = (config: ApplicationNumberConfig): string => {
  const { institution, year = new Date().getFullYear() } = config
  
  // Validate institution
  if (!['MIHAS', 'KATC'].includes(institution)) {
    throw new Error('Invalid institution. Must be MIHAS or KATC')
  }
  
  // Generate cryptographically secure random number
  const randomBytes = new Uint8Array(3)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(randomBytes)
  } else {
    // Fallback for environments without crypto
    for (let i = 0; i < randomBytes.length; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256)
    }
  }
  
  // Convert to 5-digit number (10000-99999 range)
  const randomNumber = (randomBytes[0] << 16 | randomBytes[1] << 8 | randomBytes[2]) % 90000 + 10000
  
  return `${institution}${year}${randomNumber}`
}

export const validateApplicationNumber = (applicationNumber: string): boolean => {
  const pattern = /^(MIHAS|KATC)\d{9}$/
  return pattern.test(applicationNumber)
}

export const parseApplicationNumber = (applicationNumber: string): {
  institution: string
  year: number
  sequence: number
} | null => {
  if (!validateApplicationNumber(applicationNumber)) {
    return null
  }
  
  const institution = applicationNumber.substring(0, applicationNumber.match(/\d/)?.index || 0)
  const yearStr = applicationNumber.substring(institution.length, institution.length + 4)
  const sequenceStr = applicationNumber.substring(institution.length + 4)
  
  return {
    institution,
    year: parseInt(yearStr),
    sequence: parseInt(sequenceStr)
  }
}