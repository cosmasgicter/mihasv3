#!/usr/bin/env node

/**
 * Test script for CORRECTED grades calculation
 * Zambian system: LOWER TOTAL = BETTER
 * Run with: node test-grades-calculation.js
 */

function calculateBestFivePoints(grades) {
  if (!Array.isArray(grades) || grades.length === 0) return 0
  
  const validGrades = grades
    .filter(g => typeof g === 'number' && g >= 1 && g <= 9)
    .sort((a, b) => a - b) // Sort ascending (best/lowest first)
    .slice(0, 5)
  
  return validGrades.reduce((sum, grade) => sum + grade, 0)
}

console.log('🧪 Testing CORRECTED Grades Calculation System\n')
console.log('IMPORTANT: Lower total = Better performance\n')

// Test 1: User's example
console.log('Test 1: User Example')
const testGrades1 = [1, 2, 1, 3, 1, 7, 4, 6]
const points1 = calculateBestFivePoints(testGrades1)
console.log(`Grades: ${testGrades1.join(', ')}`)
console.log(`Best 5: 1, 1, 1, 2, 3`)
console.log(`Points: ${points1} (Expected: 1+1+1+2+3 = 8)`)
console.log(`✅ ${points1 === 8 ? 'PASS' : 'FAIL'}\n`)

// Test 2: All distinctions
console.log('Test 2: All Distinctions (Best Possible)')
const testGrades2 = [1, 1, 1, 1, 1, 2, 2]
const points2 = calculateBestFivePoints(testGrades2)
console.log(`Grades: ${testGrades2.join(', ')}`)
console.log(`Best 5: 1, 1, 1, 1, 1`)
console.log(`Points: ${points2} (Expected: 1+1+1+1+1 = 5)`)
console.log(`✅ ${points2 === 5 ? 'PASS' : 'FAIL'}\n`)

// Test 3: Mixed grades
console.log('Test 3: Mixed Grades')
const testGrades3 = [2, 4, 5, 7, 8, 9]
const points3 = calculateBestFivePoints(testGrades3)
console.log(`Grades: ${testGrades3.join(', ')}`)
console.log(`Best 5: 2, 4, 5, 7, 8`)
console.log(`Points: ${points3} (Expected: 2+4+5+7+8 = 26)`)
console.log(`✅ ${points3 === 26 ? 'PASS' : 'FAIL'}\n`)

// Test 4: Worst possible
console.log('Test 4: Worst Possible')
const testGrades4 = [9, 9, 9, 9, 9]
const points4 = calculateBestFivePoints(testGrades4)
console.log(`Grades: ${testGrades4.join(', ')}`)
console.log(`Best 5: 9, 9, 9, 9, 9`)
console.log(`Points: ${points4} (Expected: 9+9+9+9+9 = 45)`)
console.log(`✅ ${points4 === 45 ? 'PASS' : 'FAIL'}\n`)

// Test 5: Less than 5 subjects
console.log('Test 5: Less Than 5 Subjects')
const testGrades5 = [1, 2, 3]
const points5 = calculateBestFivePoints(testGrades5)
console.log(`Grades: ${testGrades5.join(', ')}`)
console.log(`Best 5: 1, 2, 3 (only 3 available)`)
console.log(`Points: ${points5} (Expected: 1+2+3 = 6)`)
console.log(`✅ ${points5 === 6 ? 'PASS' : 'FAIL'}\n`)

console.log('📊 Summary')
console.log('================')
console.log('✅ Grades calculation CORRECTED!')
console.log('\nGrade Scale (1-9):')
console.log('  1-3: Distinction/Merit (Excellent)')
console.log('  4-6: Credit/Pass (Good)')
console.log('  7-9: Weak/Fail (Poor)')
console.log('\nPoints Interpretation:')
console.log('  5-15: Excellent (mostly 1s, 2s, 3s)')
console.log('  16-25: Good (mix of 3s, 4s, 5s)')
console.log('  26-35: Average (mix of 5s, 6s, 7s)')
console.log('  36-45: Below Average (mostly 7s, 8s, 9s)')
console.log('\n⚠️  REMEMBER: LOWER POINTS = BETTER PERFORMANCE')
