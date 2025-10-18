#!/usr/bin/env node

const convertGradeToPoints = (grade) => {
  if (!Number.isFinite(grade)) return 0
  if (grade >= 1 && grade <= 9) return grade
  return 0
}

const calculateBestFivePoints = (grades) => {
  const validGrades = grades.filter(g => g >= 1 && g <= 12)
  if (validGrades.length === 0) return 0
  
  const bestGrades = [...validGrades]
    .sort((a, b) => a - b)
    .slice(0, 5)

  return bestGrades.reduce((total, grade) => total + convertGradeToPoints(grade), 0)
}

console.log('🇿🇲 Correct Zambian Grading Test')
console.log('=' .repeat(40))

const testGrades = [1,1,2,2,3,1,4,2,1]
console.log(`Grades: [${testGrades.join(', ')}]`)

const sorted = [...testGrades].sort((a, b) => a - b)
console.log(`Sorted: [${sorted.join(', ')}]`)

const best5 = sorted.slice(0, 5)
console.log(`Best 5: [${best5.join(', ')}]`)

const points = best5.map(g => convertGradeToPoints(g))
console.log(`Points: [${points.join(', ')}]`)

const total = calculateBestFivePoints(testGrades)
console.log(`Total: ${total} points`)
console.log(`Expected: 6 points`)
console.log(`Match: ${total === 6 ? '✅' : '❌'}`)