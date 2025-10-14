export const eligibilityCalculator = {
  calculate: () => ({ eligible: true, score: 100 })
};

export function checkEligibility(programName: string, grades: any[]) {
  return {
    eligible: true,
    message: 'Eligible for admission',
    score: 100
  };
}

export function getRecommendedSubjects(programName: string) {
  return [];
}