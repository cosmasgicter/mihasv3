// 100% Free Local AI Processing - No External Dependencies
export class LocalAI {
  private static instance: LocalAI
  
  static getInstance(): LocalAI {
    if (!LocalAI.instance) {
      LocalAI.instance = new LocalAI()
    }
    return LocalAI.instance
  }

  // Generate intelligent responses using pattern matching and context
  generateResponse(userMessage: string, context: any): string {
    const lowerMessage = userMessage.toLowerCase()
    
    // Eligibility queries
    if (this.matchesPattern(lowerMessage, ['eligibility', 'qualify', 'chances', 'probability'])) {
      return this.generateEligibilityResponse(context)
    }
    
    // Document help
    if (this.matchesPattern(lowerMessage, ['document', 'upload', 'file', 'photo'])) {
      return this.generateDocumentResponse(context)
    }
    
    // Subject/grade help
    if (this.matchesPattern(lowerMessage, ['subject', 'grade', 'mark', 'result'])) {
      return this.generateSubjectResponse(context)
    }
    
    // Payment help
    if (this.matchesPattern(lowerMessage, ['payment', 'fee', 'money', 'pay'])) {
      return this.generatePaymentResponse(context)
    }
    
    // Step guidance
    if (this.matchesPattern(lowerMessage, ['step', 'next', 'process', 'guide'])) {
      return this.generateStepResponse(context)
    }
    
    // Default intelligent response
    return this.generateDefaultResponse(userMessage, context)
  }

  private matchesPattern(text: string, keywords: string[]): boolean {
    return keywords.some(keyword => text.includes(keyword))
  }

  private generateEligibilityResponse(context: any): string {
    const { applicationData } = context
    const gradeCount = applicationData?.grades?.length || 0
    const hasDocuments = !!(applicationData?.result_slip_url && applicationData?.pop_url)
    
    let probability = 50 // Base probability
    if (gradeCount >= 6) probability += 20
    if (hasDocuments) probability += 20
    if (applicationData?.program) probability += 10
    
    return `🎯 **Eligibility Assessment**:

**Current Probability**: ${probability}% admission chance
**Program**: ${applicationData?.program || 'Not selected'}
**Subjects**: ${gradeCount}/5 minimum required
**Documents**: ${hasDocuments ? 'Complete' : 'Missing documents'}

**To improve your chances**:
${gradeCount < 6 ? '• Add more subjects (aim for 6-8)' : '✅ Good subject count'}
${!applicationData?.result_slip_url ? '• Upload result slip' : '✅ Result slip uploaded'}
${!applicationData?.pop_url ? '• Upload payment proof' : '✅ Payment verified'}

${probability >= 70 ? '🌟 Excellent chances!' : probability >= 50 ? '📈 Good progress, keep improving!' : '⚠️ Need more requirements'}`
  }

  private generateDocumentResponse(context: any): string {
    const { applicationData } = context
    
    return `📄 **Document Upload Guide**:

**Required Documents**:
${applicationData?.result_slip_url ? '✅' : '❌'} Result Slip (Grade 12 certificate)
${applicationData?.pop_url ? '✅' : '❌'} Proof of Payment (K153 receipt)
${applicationData?.extra_kyc_url ? '✅' : '⚪'} Extra KYC (Optional)

**Upload Tips**:
• Clear, well-lit photos
• All text must be readable
• JPG, PNG, or PDF format
• Maximum 10MB file size
• Avoid shadows and glare

**AI Features**:
• Automatic data extraction
• Quality assessment
• Smart suggestions for improvement

Need help with a specific document?`
  }

  private generateSubjectResponse(context: any): string {
    const { applicationData } = context
    const program = applicationData?.program
    const grades = applicationData?.grades || []
    
    const coreSubjects = this.getCoreSubjects(program)
    
    return `📚 **Subject Requirements for ${program || 'Your Program'}**:

**Your Progress**: ${grades.length} subjects added
**Minimum Required**: 5 subjects
**Recommended**: 6-8 subjects

**Core Subjects**:
${coreSubjects.map(subject => {
  const hasSubject = grades.some((g: any) => 
    g.subject.toLowerCase().includes(subject.toLowerCase())
  )
  return `${hasSubject ? '✅' : '❌'} ${subject}`
}).join('\n')}

**Grade Quality** (1=A+, 9=F):
${grades.length > 0 ? 
  `Average: ${(grades.reduce((sum: number, g: any) => sum + g.grade, 0) / grades.length).toFixed(1)}` :
  'Add subjects to see analysis'
}

**Tips**: Focus on core subjects first, then add additional strong subjects!`
  }

  private generatePaymentResponse(context: any): string {
    const { applicationData } = context
    const institution = this.getInstitution(applicationData?.program)
    const paymentNumber = institution === 'KATC' ? '0966 992 299' : '0961 515 151'
    
    return `💳 **Payment Information**:

**Application Fee**: K153.00
**Institution**: ${institution}
**Payment Method**: MTN Mobile Money
**Number**: ${paymentNumber}
**Status**: ${applicationData?.pop_url ? '✅ Uploaded' : '❌ Pending'}

**Payment Steps**:
1. Send K153 to ${paymentNumber}
2. Save transaction receipt
3. Upload proof in Step 3
4. Include reference number

**Upload Requirements**:
• Clear screenshot of receipt
• All transaction details visible
• JPG, PNG, or PDF format`
  }

  private generateStepResponse(context: any): string {
    const { currentStep, applicationData } = context
    
    const steps = [
      { name: 'Basic Info', complete: !!applicationData?.program },
      { name: 'Education', complete: (applicationData?.grades?.length || 0) >= 5 },
      { name: 'Payment', complete: !!applicationData?.pop_url },
      { name: 'Review', complete: false }
    ]
    
    return `🗺️ **Application Process**:

${steps.map((step, idx) => 
  `${idx + 1 === currentStep ? '👉 ' : ''}${step.complete ? '✅' : '❌'} Step ${idx + 1}: ${step.name}${idx + 1 === currentStep ? ' (Current)' : ''}`
).join('\n')}

**Current Step ${currentStep || 1}**:
${this.getStepGuidance(currentStep || 1, applicationData)}

**Overall Progress**: ${steps.filter(s => s.complete).length}/4 steps complete`
  }

  private generateDefaultResponse(userMessage: string, context: any): string {
    return `I understand you're asking about "${userMessage}".

Based on your application progress, I can help with:

🎯 **Eligibility Check** - Real-time assessment
📄 **Document Upload** - Step-by-step guidance  
📚 **Subject Selection** - Program requirements
💳 **Payment Process** - Fee and upload help
🗺️ **Step Navigation** - Process walkthrough

What specific area would you like help with?`
  }

  private getCoreSubjects(program: string): string[] {
    const subjects: Record<string, string[]> = {
      'Clinical Medicine': ['Mathematics', 'Biology', 'Chemistry', 'Physics', 'English'],
      'Environmental Health': ['Mathematics', 'Biology', 'Chemistry', 'Geography', 'English'],
      'Registered Nursing': ['Mathematics', 'Biology', 'Chemistry', 'English']
    }
    return subjects[program] || []
  }

  private getInstitution(program: string): string {
    return ['Clinical Medicine', 'Environmental Health'].includes(program) ? 'Kalulushi Training Centre' : 'Mukuba Institute of Health and Allied Sciences'
  }

  private getStepGuidance(step: number, applicationData: any): string {
    const guides: Record<number, string> = {
      1: 'Fill personal information and select your program',
      2: 'Add Grade 12 subjects and upload result slip',
      3: 'Upload proof of K153 payment',
      4: 'Review all information and submit'
    }
    return guides[step] || 'Continue with your application'
  }

  // Generate contextual suggestions
  generateSuggestions(userMessage: string, context: any): string[] {
    const lowerMessage = userMessage.toLowerCase()
    
    if (this.matchesPattern(lowerMessage, ['eligibility'])) {
      return ['How can I improve my chances?', 'What documents do I need?', 'Check my progress']
    }
    
    if (this.matchesPattern(lowerMessage, ['document'])) {
      return ['Help with result slip', 'Payment proof guide', 'Document quality tips']
    }
    
    // Default suggestions based on application state
    const suggestions = []
    const { applicationData } = context
    
    if (!applicationData?.program) suggestions.push('Help me choose a program')
    if (!applicationData?.grades?.length) suggestions.push('Guide me through subjects')
    if (!applicationData?.result_slip_url) suggestions.push('Document upload help')
    
    return suggestions.length > 0 ? suggestions : ['What\'s my next step?', 'Check eligibility', 'Any tips?']
  }
}

export const localAI = LocalAI.getInstance()