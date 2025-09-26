#!/usr/bin/env node

/**
 * Test Zambian Grading System Implementation
 * 
 * Zambian Grade Scale:
 * Grade 1 = 9 points (Distinction)
 * Grade 2 = 8 points (Merit)
 * Grade 3 = 7 points (Credit)
 * Grade 4 = 6 points (Credit)
 * Grade 5 = 5 points (Credit)
 * Grade 6 = 4 points (Pass)
 * Grade 7 = 3 points (Pass)
 * Grade 8 = 2 points (Pass)
 * Grade 9 = 1 point (Pass)
 * Grade 10-12 = 0 points (Fail)
 */

// Mock the grades utility functions
const convertGradeToPoints = (grade) => {
  if (!Number.isFinite(grade)) {
    return 0
  }

  // Zambian grading system: Grade 1 = 9 points, Grade 2 = 8 points, etc.
  // Grade 9 = 1 point, Grade 10-12 = 0 points
  if (grade >= 1 && grade <= 9) {
    return 10 - grade
  }
  
  return 0
}

const calculateBestFivePoints = (grades) => {
  const validGrades = grades.filter(g => g >= 1 && g <= 12)
  
  if (validGrades.length === 0) {
    return 0
  }

  // Sort by grade value (ascending) to get best grades first (1 is better than 9)
  const bestGrades = [...validGrades]
    .sort((a, b) => a - b)
    .slice(0, 5)

  return bestGrades.reduce((total, grade) => total + convertGradeToPoints(grade), 0)
}

console.log('🇿🇲 Testing Zambian Grading System')
console.log('=' .repeat(50))

// Test individual grade conversions
console.log('\n📊 Individual Grade to Points Conversion:')
for (let grade = 1; grade <= 12; grade++) {
  const points = convertGradeToPoints(grade)
  console.log(`   Grade ${grade} = ${points} points`)
}

// Test best 5 calculations
console.log('\n🏆 Best 5 Points Calculations:')

const testCases = [
  {
    name: 'Excellent student (all distinctions)',
    grades: [1, 1, 1, 1, 1, 2, 2],
    expected: 45 // 5 × 9 points
  },
  {
    name: 'Good student (mixed grades)',
    grades: [1, 2, 3, 4, 5, 6, 7],
    expected: 35 // 9+8+7+6+5 = 35 points
  },
  {
    name: 'Average student',
    grades: [3, 4, 5, 6, 7, 8, 9],
    expected: 25 // 7+6+5+4+3 = 25 points
  },
  {
    name: 'Struggling student',
    grades: [6, 7, 8, 9, 10, 11, 12],
    expected: 10 // 4+3+2+1+0 = 10 points
  },
  {
    name: 'Mixed performance',
    grades: [1, 5, 9, 10, 11],
    expected: 15 // 9+5+1+0+0 = 15 points
  }
]

testCases.forEach(testCase => {
  const result = calculateBestFivePoints(testCase.grades)
  const passed = result === testCase.expected
  
  console.log(`\n   ${testCase.name}:`)
  console.log(`   Grades: [${testCase.grades.join(', ')}]`)
  console.log(`   Expected: ${testCase.expected} points`)
  console.log(`   Actual: ${result} points`)
  console.log(`   Status: ${passed ? '✅ PASS' : '❌ FAIL'}`)
  
  if (!passed) {
    console.log(`   ⚠️  Expected ${testCase.expected} but got ${result}`)
  }
})

console.log('\n' + '=' .repeat(50))
console.log('🏁 Zambian Grading Test Complete')