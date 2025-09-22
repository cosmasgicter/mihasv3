import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, Send, Bot, User, X, Lightbulb, FileText, HelpCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { supabase } from '@/lib/supabase'
import { predictiveAnalytics } from '@/lib/predictiveAnalytics'
import { documentAI } from '@/lib/documentAI'
import { localAI } from '@/lib/localAI'


interface Message {
  id: string
  type: 'user' | 'assistant'
  content: string
  timestamp: Date
  suggestions?: string[]
  isTyping?: boolean
}

interface AIAssistantProps {
  applicationData?: any
  currentStep?: number
  onSuggestionApply?: (suggestion: any) => void
  onDataUpdate?: (data: any) => void
}

export function AIAssistant({ applicationData, currentStep, onSuggestionApply, onDataUpdate }: AIAssistantProps) {
  const { user } = useAuth()
  const { profile } = useProfileQuery()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [hasUnreadSuggestions, setHasUnreadSuggestions] = useState(true)

  const getDocumentStatus = (appData: any): string => {
    const docs = []
    if (appData?.result_slip_url) docs.push('Result Slip')
    if (appData?.pop_url) docs.push('Payment Proof')
    if (appData?.extra_kyc_url) docs.push('KYC Documents')
    return docs.length > 0 ? docs.join(', ') + ' uploaded' : 'None uploaded'
  }

  const getCoreSubjectsForProgram = (program: string): string => {
    const coreSubjects: Record<string, string[]> = {
      'Clinical Medicine': ['Mathematics', 'Biology', 'Chemistry', 'Physics', 'English'],
      'Environmental Health': ['Mathematics', 'Biology', 'Chemistry', 'Geography', 'English'],
      'Registered Nursing': ['Mathematics', 'Biology', 'Chemistry', 'English', 'Additional Mathematics']
    }
    
    const subjects = coreSubjects[program] || []
    return subjects.length > 0 ? subjects.map(s => `• ${s}`).join('\n') : 'Please select your program first.'
  }

  const getPaymentNumber = (program: string): string => {
    return ['Clinical Medicine', 'Environmental Health'].includes(program) 
      ? 'MTN 0966 992 299 (KATC)' 
      : 'MTN 0961 515 151 (MIHAS)'
  }

  const getContactInfo = (program: string): string => {
    return ['Clinical Medicine', 'Environmental Health'].includes(program)
      ? '+260 966 992 299 (KATC)'
      : '+260 961 515 151 (MIHAS)'
  }

  const getStepGuidance = (step: number, appData: any): string => {
    const stepGuides = {
      1: `📝 **Step 1: Basic Information**\n\nYou're filling out your personal details and selecting your program.\n\n**What you need**:\n• Full name and contact information\n• Program selection (Clinical Medicine, Environmental Health, or Registered Nursing)\n• Basic demographic information\n\n**Tips**:\n• Double-check your contact information\n• Choose your program carefully - this affects requirements\n• All fields marked with * are required`,
      
      2: `📚 **Step 2: Education Details**\n\nTime to add your Grade 12 subjects and upload documents.\n\n**Requirements**:\n• Minimum 5 subjects (recommended: 6-8)\n• Include core subjects for your program\n• Upload clear, readable result slip\n\n**Program-specific core subjects**:\n${getCoreSubjectsForProgram(appData?.program)}\n\n**Current progress**: ${appData?.grades?.length || 0} subjects added`,
      
      3: `💳 **Step 3: Payment Information**\n\nUpload your proof of payment for the K153 application fee.\n\n**Payment details**:\n• Amount: K153.00\n• Method: Mobile Money\n• Pay to: ${getPaymentNumber(appData?.program)}\n\n**Upload requirements**:\n• Clear screenshot or photo of transaction\n• Include transaction reference if available\n• Accepted formats: JPG, PNG, PDF`,
      
      4: `✅ **Step 4: Review & Submit**\n\nFinal check before submitting your application.\n\n**Review checklist**:\n• Personal information is correct\n• All required subjects added\n• Documents are clear and readable\n• Payment proof is uploaded\n\n**After submission**:\n• You'll receive a tracking code\n• Processing takes 3-5 business days\n• You can track status anytime`
    }
    
    return stepGuides[step as keyof typeof stepGuides] || 'Step information not available.'
  }

  const getTroubleshootingHelp = (message: string, appData: any): string => {
    const lowerMessage = message.toLowerCase()
    
    if (lowerMessage.includes('upload') || lowerMessage.includes('file')) {
      return `📄 **Document Upload Troubleshooting**:\n\n**Common issues & solutions**:\n• **File too large**: Compress image or use PDF (max 10MB)\n• **Upload fails**: Check internet connection, try different browser\n• **Poor quality**: Ensure good lighting, document is flat\n• **Wrong format**: Use JPG, PNG, or PDF only\n\n**For best results**:\n• Take photo in good lighting\n• Ensure all text is clearly visible\n• Avoid shadows or glare\n• Keep file size under 5MB for faster upload`
    }
    
    if (lowerMessage.includes('grade') || lowerMessage.includes('subject')) {
      return `📚 **Subject/Grade Issues**:\n\n**Common problems**:\n• **Can't find subject**: Type the exact name from your result slip\n• **Wrong grade**: Use 1-9 scale (1=highest, 9=lowest)\n• **Missing subjects**: You need minimum 5 subjects\n\n**Tips**:\n• Add subjects exactly as they appear on your certificate\n• Include all subjects, even if grade is not perfect\n• Core subjects are most important for your program`
    }
    
    return `🔧 **General Troubleshooting**:\n\n**Try these steps**:\n1. Refresh the page and try again\n2. Clear your browser cache\n3. Try a different browser (Chrome recommended)\n4. Check your internet connection\n5. Contact support if issue persists\n\n**Need immediate help?**\nContact: ${getContactInfo(appData?.program)}`
  }

  const getApplicationStatus = (appData: any): string => {
    const completionItems = [
      { name: 'Program Selection', completed: !!appData?.program, required: true },
      { name: 'Personal Information', completed: !!appData?.full_name, required: true },
      { name: 'Grade 12 Subjects', completed: (appData?.grades?.length || 0) >= 5, required: true },
      { name: 'Result Slip', completed: !!appData?.result_slip_url, required: true },
      { name: 'Payment Proof', completed: !!appData?.pop_url, required: true },
      { name: 'Extra KYC', completed: !!appData?.extra_kyc_url, required: false }
    ]
    
    const requiredCompleted = completionItems.filter(item => item.required && item.completed).length
    const totalRequired = completionItems.filter(item => item.required).length
    const completionPercentage = Math.round((requiredCompleted / totalRequired) * 100)
    
    return `📊 **Application Status**:\n\n**Overall Progress**: ${completionPercentage}% complete\n\n**Checklist**:\n${completionItems.map(item => 
      `${item.completed ? '✅' : '❌'} ${item.name}${item.required ? ' (Required)' : ' (Optional)'}`
    ).join('\n')}\n\n**Next Steps**:\n${completionItems.filter(item => item.required && !item.completed).length > 0 ? 
      completionItems.filter(item => item.required && !item.completed).map(item => `• Complete ${item.name}`).join('\n') :
      '🎉 All required items complete! Ready to submit your application.'
    }\n\n**Estimated Time to Complete**: ${completionItems.filter(item => item.required && !item.completed).length * 5} minutes`
  }

  const getPersonalizedTips = (appData: any): string => {
    const tips = []
    
    if (!appData?.program) {
      tips.push('🎯 Choose your program carefully - it affects all requirements')
    }
    
    if ((appData?.grades?.length || 0) < 6) {
      tips.push('📚 Add 6-8 subjects for the best chances (minimum 5 required)')
    }
    
    if (appData?.grades?.length > 0) {
      const avgGrade = appData.grades.reduce((sum: number, g: any) => sum + g.grade, 0) / appData.grades.length
      if (avgGrade > 4) {  // In Zambian system, higher numbers are worse grades
        tips.push('📈 Focus on your strongest subjects - quality over quantity')
      } else {
        tips.push('🌟 Great grades! You have excellent admission chances')
      }
    }
    
    if (!appData?.result_slip_url) {
      tips.push('📄 Upload a clear, high-quality result slip for faster processing')
    }
    
    if (!appData?.pop_url) {
      tips.push('💳 Upload payment proof as soon as possible to avoid delays')
    }
    
    if (tips.length === 0) {
      tips.push('🎉 Your application looks great! Double-check everything before submitting')
      tips.push('⏰ Submit early - applications are processed first-come, first-served')
      tips.push('📞 Save our contact number in case you need help later')
    }
    
    return `💡 **Personalized Tips for You**:\n\n${tips.map((tip, idx) => `${idx + 1}. ${tip}`).join('\n')}\n\n**Pro Tip**: The AI can auto-fill information from your documents - just upload clear, readable files!`
  }

  const generateContextualSuggestions = (userMessage: string, appData: any): string[] => {
    return localAI.generateSuggestions(userMessage, { applicationData: appData, currentStep })
  }

  const saveConversation = async (messages: Message[]): Promise<void> => {
    try {
      if (!conversationId || !user) return
      
      await supabase
        .from('ai_conversations')
        .update({
          messages,
          context: {
            currentStep,
            program: applicationData?.program,
            lastInteraction: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId)
    } catch (error) {
      console.error('Failed to save conversation:', error)
    }
  }

  useEffect(() => {
    if (user && isOpen && messages.length === 0) {
      initializeConversation()
    }
  }, [user, isOpen])

  const initializeConversation = async () => {
    try {
      setIsLoading(true)
      
      // Load existing conversation or create new one
      const { data: existingConversation } = await supabase
        .from('ai_conversations')
        .select('*')
        .eq('user_id', user?.id)
        .eq('application_id', applicationData?.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existingConversation) {
        setConversationId(existingConversation.id)
        setMessages(existingConversation.messages || [])
      } else {
        // Create welcome message
        const welcomeMessage: Message = {
          id: '1',
          type: 'assistant',
          content: `👋 Hi ${profile?.full_name || 'there'}! I'm your AI application assistant. I can help you with:\n\n• Filling out your application\n• Understanding requirements\n• Checking eligibility\n• Uploading documents\n• Program-specific guidance\n\nHow can I help you today?`,
          timestamp: new Date(),
          suggestions: [
            'Check my eligibility for my program',
            'Help me with document requirements',
            'What subjects should I choose?',
            'Guide me through the application process'
          ]
        }
        setMessages([welcomeMessage])
        
        // Create new conversation
        const { data: newConversation } = await supabase
          .from('ai_conversations')
          .insert({
            user_id: user?.id,
            application_id: applicationData?.id,
            messages: [welcomeMessage],
            context: {
              currentStep,
              program: applicationData?.program,
              userProfile: profile
            }
          })
          .select()
          .single()
        
        if (newConversation) {
          setConversationId(newConversation.id)
        }
      }
    } catch (error) {
      console.error('Failed to initialize conversation:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    if (messages.length > 0) {
      // Small delay to ensure DOM is updated
      setTimeout(scrollToBottom, 100)
    }
  }, [messages, isTyping])

  // Auto-save conversation periodically
  useEffect(() => {
    if (messages.length > 1 && conversationId) {
      const saveTimer = setTimeout(() => {
        saveConversation(messages)
      }, 2000)
      
      return () => clearTimeout(saveTimer)
    }
  }, [messages, conversationId])

  const generateResponse = async (userMessage: string): Promise<string> => {
    try {
      // Generate intelligent response using local AI
      return localAI.generateResponse(userMessage, {
        applicationData,
        currentStep,
        profile
      })
    } catch (error) {
      console.error('Error generating response:', error)
      return 'I apologize, but I\'m having trouble processing your request right now. Please try again or contact support if the issue persists.'
    }
  }

  const generateLegacyResponse = async (userMessage: string): Promise<string> => {
    try {
      const lowerMessage = userMessage.toLowerCase()
      
      if (lowerMessage.includes('eligibility') || lowerMessage.includes('qualify')) {
        // Get real-time eligibility prediction
        let eligibilityInfo = ''
        if (applicationData && applicationData.program) {
          try {
            const prediction = await predictiveAnalytics.predictAdmissionSuccess(applicationData)
            const probability = Math.round(prediction.admissionProbability * 100)
            
            eligibilityInfo = `\n\n🎯 **AI Prediction**: ${probability}% admission probability\n⚠️ **Risk Factors**: ${prediction.riskFactors.length > 0 ? prediction.riskFactors.join(', ') : 'None identified'}\n💡 **Recommendations**: ${prediction.recommendations.slice(0, 2).join(', ')}`
          } catch (error) {
            console.error('Failed to get prediction:', error)
          }
        }
        
        return `Based on your current application data, here's your eligibility status:

📊 **Current Status**: ${applicationData?.program ? 'Good progress' : 'Just getting started'}
📚 **Program**: ${applicationData?.program || 'Not selected yet'}
📝 **Subjects**: ${applicationData?.grades?.length || 0} subjects added
📄 **Documents**: ${getDocumentStatus(applicationData)}${eligibilityInfo}

**Next Steps**:
• ${!applicationData?.program ? 'Select your preferred program' : '✅ Program selected'}
• ${!applicationData?.grades?.length ? 'Add your Grade 12 subjects' : '✅ Subjects added'}
• ${!applicationData?.result_slip_url ? 'Upload your result slip' : '✅ Result slip uploaded'}
• ${!applicationData?.pop_url ? 'Upload proof of payment' : '✅ Payment proof uploaded'}

Would you like me to guide you through any of these steps?`
      }
    
    if (lowerMessage.includes('document') || lowerMessage.includes('upload')) {
      const docStatus = {
        resultSlip: applicationData?.result_slip_url ? '✅ Uploaded' : '❌ Required',
        paymentProof: applicationData?.pop_url ? '✅ Uploaded' : '❌ Required',
        extraKYC: applicationData?.extra_kyc_url ? '✅ Uploaded' : '⚪ Optional'
      }
      
      return `📄 **Document Upload Guide**:

**Document Status**:
1. **Result Slip** ${docStatus.resultSlip} - Your Grade 12 examination results
2. **Proof of Payment** ${docStatus.paymentProof} - K153 application fee receipt
3. **Extra KYC** ${docStatus.extraKYC} - Additional identification documents

**Upload Requirements**:
• Clear, high-resolution images
• All text must be readable
• Accepted formats: JPG, PNG, PDF
• Maximum file size: 10MB
• Good lighting, no shadows

**🤖 AI Features**:
• Automatic information extraction
• Document quality assessment
• Smart auto-fill suggestions
• Real-time validation

**Troubleshooting**:
• File too large? Compress or use PDF
• Upload failing? Check internet connection
• Poor quality? Retake in better lighting

Which document do you need help with?`
    }
    
    if (lowerMessage.includes('subject') || lowerMessage.includes('grade')) {
      const program = applicationData?.program
      const currentGrades = applicationData?.grades || []
      let subjects = []
      
      if (program === 'Clinical Medicine') {
        subjects = ['Mathematics', 'Biology', 'Chemistry', 'Physics', 'English']
      } else if (program === 'Environmental Health') {
        subjects = ['Mathematics', 'Biology', 'Chemistry', 'Geography', 'English']
      } else if (program === 'Registered Nursing') {
        subjects = ['Mathematics', 'Biology', 'Chemistry', 'English', 'Additional Mathematics']
      }
      
      const hasCore = subjects.every(subject => 
        currentGrades.some((grade: any) => 
          grade.subject.toLowerCase().includes(subject.toLowerCase())
        )
      )
      
      return `📚 **Subject Guide for ${program || 'your program'}**:

**Your Progress**: ${currentGrades.length} subjects added
**Core Subjects Status**: ${hasCore ? '✅ Complete' : '❌ Missing some core subjects'}

${subjects.length > 0 ? 
  `**Core Subjects for ${program}**:\n${subjects.map(s => {
    const hasSubject = currentGrades.some((g: any) => g.subject.toLowerCase().includes(s.toLowerCase()))
    return `${hasSubject ? '✅' : '❌'} ${s}`
  }).join('\n')}\n\n` : 
  'Please select your program first to get subject recommendations.\n\n'
}**Requirements**:
• Minimum 5 subjects (you have ${currentGrades.length})
• Maximum 10 subjects allowed
• Grades on 1-9 scale (1=A+, 9=F)
• Core subjects are most important

**Grade Quality**:
${currentGrades.length > 0 ? 
  `• Average grade: ${(currentGrades.reduce((sum: number, g: any) => sum + g.grade, 0) / currentGrades.length).toFixed(1)}\n• Best grade: ${Math.min(...currentGrades.map((g: any) => g.grade))} (1=A+, 9=F)` :
  '• Add subjects to see grade analysis'
}

**Pro Tip**: Focus on core subjects first, then add additional subjects to strengthen your application!

${currentGrades.length < 5 ? 'You need to add more subjects to meet the minimum requirement.' : 'Great progress! Consider adding more subjects if you have strong grades.'}`
    }
    
    if (lowerMessage.includes('payment') || lowerMessage.includes('fee')) {
      const institution = applicationData?.program ? 
        (['Clinical Medicine', 'Environmental Health'].includes(applicationData.program) ? 'KATC' : 'MIHAS') : 
        'your institution'
      
      const paymentTarget = institution === 'KATC' ? 'MTN 0966 992 299' : 'MTN 0961 515 151'
      const paymentStatus = applicationData?.pop_url ? '✅ Payment proof uploaded' : '❌ Payment proof needed'
      
      return `💳 **Payment Information**:

**Application Fee**: K153.00
**Payment Method**: Mobile Money
**Pay to**: ${paymentTarget} (${institution})
**Status**: ${paymentStatus}

**Payment Steps**:
1. Send K153 to the number above
2. Save the transaction receipt/screenshot
3. Upload the proof of payment in Step 3
4. Include transaction reference if available

**Upload Tips**:
• Clear, readable screenshot
• Include full transaction details
• Accepted formats: JPG, PNG, PDF
• Maximum size: 10MB

**Important**: Keep your payment receipt safe - you'll need it for verification!

${!applicationData?.pop_url ? 'Ready to upload your payment proof?' : 'Great! Your payment proof is uploaded.'}`
    }
    
    if (lowerMessage.includes('step') || lowerMessage.includes('next')) {
      const stepGuide = [
        '📝 **Step 1**: Basic KYC - Personal information and program selection',
        '📚 **Step 2**: Education - Grade 12 subjects and document upload',
        '💳 **Step 3**: Payment - Application fee and proof of payment',
        '✅ **Step 4**: Review - Final check and submission'
      ]
      
      const completionStatus = [
        applicationData?.program ? '✅' : '❌',
        (applicationData?.grades?.length >= 5 && applicationData?.result_slip_url) ? '✅' : '❌',
        applicationData?.pop_url ? '✅' : '❌',
        false ? '✅' : '⏳' // Step 4 is always pending until submission
      ]
      
      return `🗺️ **Application Process Guide**:

${stepGuide.map((step, idx) => 
  `${idx + 1 === currentStep ? '👉 ' : ''}${completionStatus[idx]} ${step}${idx + 1 === currentStep ? ' (Current)' : ''}`
).join('\n')}

**Progress Summary**:
• Personal Info: ${applicationData?.full_name ? '✅ Complete' : '❌ Incomplete'}
• Program Selected: ${applicationData?.program ? '✅ ' + applicationData.program : '❌ Not selected'}
• Subjects Added: ${applicationData?.grades?.length || 0}/5 minimum
• Documents: ${[applicationData?.result_slip_url, applicationData?.pop_url].filter(Boolean).length}/2 required

${currentStep ? `\n**Current Step ${currentStep}**:\n${getStepGuidance(currentStep, applicationData)}` : '\nReady to continue with your application?'}`
    }
    
      // Smart contextual responses based on current step
      if (currentStep && (lowerMessage.includes('help') || lowerMessage.includes('guide'))) {
        return getStepGuidance(currentStep, applicationData)
      }
      
      // Help with specific issues
      if (lowerMessage.includes('error') || lowerMessage.includes('problem') || lowerMessage.includes('issue')) {
        return getTroubleshootingHelp(userMessage, applicationData)
      }
      
      // Status and progress queries
      if (lowerMessage.includes('status') || lowerMessage.includes('progress')) {
        return getApplicationStatus(applicationData)
      }
      
      // Tips and recommendations
      if (lowerMessage.includes('tip') || lowerMessage.includes('advice') || lowerMessage.includes('recommend')) {
        return getPersonalizedTips(applicationData)
      }
      
      // Default intelligent response
      return `I understand you're asking about "${userMessage}". 

Based on your current progress, here are some ways I can help:

🎯 **Application Guidance**
• Step-by-step process walkthrough
• Program-specific requirements for ${applicationData?.program || 'your chosen program'}
• Document upload assistance

📊 **Eligibility Check**
• Real-time eligibility assessment
• Subject recommendations
• Grade requirements analysis

💡 **Smart Suggestions**
• Auto-fill from documents
• Missing information alerts
• Optimization tips

${currentStep ? `You're currently on Step ${currentStep}. ` : ''}What specific area would you like help with?`
    } catch (error) {
      console.error('Error generating response:', error)
      return 'I apologize, but I\'m having trouble processing your request right now. Please try again or contact support if the issue persists.'
    }
  }

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isTyping) return

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue.trim(),
      timestamp: new Date()
    }

    const currentInput = inputValue.trim()
    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsTyping(true)
    setHasUnreadSuggestions(false)

    try {
      const response = await generateResponse(currentInput)
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: response,
        timestamp: new Date(),
        suggestions: generateContextualSuggestions(currentInput, applicationData)
      }

      const updatedMessages = [...messages, userMessage, assistantMessage]
      setMessages(updatedMessages)
      
      // Save conversation to database
      if (conversationId && user) {
        await saveConversation(updatedMessages)
      }
      
    } catch (error) {
      console.error('Failed to generate response:', error)
      const errorMessage: Message = {
        id: (Date.now() + 2).toString(),
        type: 'assistant',
        content: 'I apologize, but I\'m having trouble right now. Please try again or contact support if the issue persists.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsTyping(false)
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    setInputValue(suggestion)
    // Small delay to ensure input is set before sending
    setTimeout(() => {
      const event = { target: { value: suggestion } }
      setInputValue(suggestion)
      handleSendMessage()
    }, 50)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isTyping && !isLoading && inputValue.trim()) {
        handleSendMessage()
      }
    }
  }

  // Handle window focus to refresh conversation
  useEffect(() => {
    const handleFocus = () => {
      if (isOpen && conversationId) {
        // Refresh conversation when window gains focus
        // This helps sync across multiple tabs
      }
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [isOpen, conversationId])

  // Don't render if user is not authenticated
  if (!user) {
    return null
  }

  return (
    <>
      {/* Floating Assistant Button */}
      <motion.button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 z-50 bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 ${isOpen ? 'hidden' : 'block'}`}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 2 }}
      >
        <MessageCircle className="h-6 w-6" />
        {hasUnreadSuggestions && (
          <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center animate-pulse">
            !
          </div>
        )}
      </motion.button>

      {/* Chat Interface */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 w-96 h-[500px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 flex items-center justify-between">
              <div className="flex items-center">
                <Bot className="h-6 w-6 mr-2" />
                <div>
                  <h3 className="font-semibold">AI Assistant</h3>
                  <p className="text-xs opacity-90">
                    {isLoading ? 'Loading...' : 
                     currentStep ? `Step ${currentStep} Help` : 
                     'Here to help with your application'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white hover:bg-white/20 p-1 rounded transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                  <span className="ml-2 text-gray-600">Loading conversation...</span>
                </div>
              ) : (
                messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] rounded-2xl p-3 ${
                      message.type === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      <div className="flex items-start space-x-2">
                        {message.type === 'assistant' && (
                          <Bot className="h-4 w-4 mt-1 flex-shrink-0 text-blue-600" />
                        )}
                        <div className="flex-1">
                          <p className="text-sm whitespace-pre-line leading-relaxed">{message.content}</p>
                          {message.suggestions && message.suggestions.length > 0 && (
                            <div className="mt-3 space-y-2">
                              <p className="text-xs opacity-70 mb-2">Quick actions:</p>
                              {message.suggestions.map((suggestion, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => handleSuggestionClick(suggestion)}
                                  className="block w-full text-left text-xs bg-white/20 hover:bg-white/30 rounded-lg p-2 transition-colors border border-white/10"
                                >
                                  {suggestion}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}

              {isTyping && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="bg-gray-100 rounded-2xl p-3 max-w-[85%]">
                    <div className="flex items-center space-x-2">
                      <Bot className="h-4 w-4 text-blue-600" />
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                      <span className="text-xs text-gray-500">AI is thinking...</span>
                    </div>
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={isTyping ? 'AI is thinking...' : 'Ask me anything about your application...'}
                  disabled={isTyping || isLoading}
                  className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || isTyping || isLoading}
                  size="sm"
                  className="rounded-full px-4 min-w-[44px] flex items-center justify-center"
                >
                  {isTyping ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {currentStep && (
                <p className="text-xs text-gray-500 mt-2 text-center">
                  💡 Currently on Step {currentStep} - I can help with this step specifically
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}