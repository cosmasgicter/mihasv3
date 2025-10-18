// Simple test to verify the fixes work
import { checkEligibility } from './src/lib/eligibility.js'

// Test eligibility checking
const testGrades = [
  { subject_id: '1', subject_name: 'English', grade: 3 },
  { subject_id: '2', subject_name: 'Mathematics', grade: 4 },
  { subject_id: '3', subject_name: 'Biology', grade: 2 },
  { subject_id: '4', subject_name: 'Chemistry', grade: 3 },
  { subject_id: '5', subject_name: 'Physics', grade: 4 }
]

console.log('Testing eligibility for Clinical Medicine...')
try {
  const result = checkEligibility('Clinical Medicine', testGrades)
  console.log('✅ Eligibility check passed:', result)
} catch (error) {
  console.error('❌ Eligibility check failed:', error.message)
}

console.log('\nTesting eligibility for Environmental Health...')
try {
  const result = checkEligibility('Environmental Health', testGrades)
  console.log('✅ Eligibility check passed:', result)
} catch (error) {
  console.error('❌ Eligibility check failed:', error.message)
}

console.log('\nTesting eligibility for Registered Nursing...')
try {
  const result = checkEligibility('Registered Nursing', testGrades)
  console.log('✅ Eligibility check passed:', result)
} catch (error) {
  console.error('❌ Eligibility check failed:', error.message)
}

console.log('\n✅ All tests completed!')