import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, CheckCircle, Send } from 'lucide-react'
import { Link } from 'react-router-dom'

import { AIAssistant } from '@/components/application/AIAssistant'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

import SubmissionSuccess from './components/SubmissionSuccess'
import BasicKycStep from './steps/BasicKycStep'
import EducationStep from './steps/EducationStep'
import PaymentStep from './steps/PaymentStep'
import SubmitStep from './steps/SubmitStep'
import useWizardController from './hooks/useWizardController'
import { previousButtonLabel, saveNowLabel, wizardSteps } from './steps/config'
import type { SubjectGrade } from './types'

const ApplicationWizard = () => {
  const {
    authLoading,
    restoringDraft,
    user,
    success,
    loading,
    uploading,
    error,
    setError,
    form,
    totalSteps,
    currentStepIndex,
    currentStepConfig,
    isLastStep,
    selectedProgram,
    selectedGrades,
    eligibilityCheck,
    recommendedSubjects,
    programs,
    intakes,
    subjects,
    hasAutoPopulatedData,
    completionPercentage,
    confirmSubmission,
    setConfirmSubmission,
    resultSlipFile,
    extraKycFile,
    popFile,
    uploadProgress,
    uploadedFiles,
    isDraftSaving,
    draftSaved,
    submittedApplication,
    persistingSlip,
    slipLoading,
    emailLoading,
    handleDownloadSlip,
    handleEmailSlip,
    handleResultSlipUpload,
    handleExtraKycUpload,
    handleProofOfPaymentUpload,
    getPaymentTarget,
    handleNextStep,
    handlePrevStep,
    handleSubmitApplication,
    addGrade,
    removeGrade,
    updateGrade,
    getUsedSubjects,
    saveDraft,
    watchValues
  } = useWizardController()

  if (authLoading || restoringDraft) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner />
          <p className="mt-4 text-gray-600">{authLoading ? 'Loading...' : 'Restoring your application...'}</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  if (success && submittedApplication) {
    return (
      <SubmissionSuccess
        submittedApplication={submittedApplication}
        persistingSlip={persistingSlip}
        slipLoading={slipLoading}
        emailLoading={emailLoading}
        onDownload={handleDownloadSlip}
        onEmail={handleEmailSlip}
      />
    )
  }

  const handleAddGrade = () => {
    setError('')
    addGrade()
  }

  const handleRemoveGrade = (index: number) => {
    setError('')
    removeGrade(index)
  }

  const handleUpdateGrade = (index: number, field: keyof SubjectGrade, value: string | number) => {
    setError('')
    updateGrade(index, field, value)
  }

  const handleGetUsedSubjects = () => getUsedSubjects()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link to="/student/dashboard" className="inline-flex items-center text-blue-600 hover:text-blue-700 mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Link>
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Student Application</h1>
            <p className="text-gray-600">Complete the {totalSteps}-step application process</p>
            <div className="mt-2 text-sm text-gray-600">Logged in as: {user.email}</div>
          </motion.div>
        </div>

        <div className="mb-6 lg:mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Step {currentStepConfig.id} of {totalSteps}: {currentStepConfig.progressTitle}
            </h2>
            <div className="flex items-center space-x-4">
              {isDraftSaving && (
                <motion.div className="flex items-center space-x-2 text-sm text-gray-600" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                  <span>Saving...</span>
                </motion.div>
              )}
              {draftSaved && (
                <motion.div className="flex items-center space-x-2 text-sm text-green-600" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
                  <CheckCircle className="h-4 w-4" />
                  <span>Saved</span>
                </motion.div>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={saveDraft} disabled={isDraftSaving} className="hover:bg-blue-50">
                <Send className="h-4 w-4 mr-2" />
                {saveNowLabel}
              </Button>
            </div>
          </div>
          <div className="relative">
            <div className="absolute top-4 left-0 w-full h-0.5 bg-gray-200 hidden sm:block" />
            <div className="flex items-center justify-between relative overflow-x-auto pb-2 sm:pb-0">
              {wizardSteps.map((step, index) => {
                const Icon = step.icon
                const isActive = index <= currentStepIndex
                const isCompleted = index < currentStepIndex
                return (
                  <motion.div
                    key={step.id}
                    className="flex flex-col items-center bg-gray-50 relative min-w-0 flex-shrink-0 px-2 sm:px-0"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: step.id * 0.1 }}
                  >
                    <motion.div
                      className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-medium border-2 transition-all duration-300 ${
                        isCompleted
                          ? 'bg-green-500 border-green-500 text-white shadow-lg'
                          : isActive
                          ? 'bg-blue-600 border-blue-600 text-white shadow-lg scale-110'
                          : 'bg-white border-gray-300 text-gray-400'
                      }`}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {isCompleted ? <CheckCircle className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                    </motion.div>
                    <div className={`mt-2 text-xs font-medium text-center whitespace-nowrap ${isActive ? 'text-blue-600' : 'text-gray-500'}`}>
                      {step.title}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        </div>

        {error && (
          <motion.div className="rounded-md bg-red-50 p-4 mb-6" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="text-sm text-red-700">{error}</div>
          </motion.div>
        )}

        <form onSubmit={form.handleSubmit(handleSubmitApplication)} className="space-y-6 lg:space-y-8">
          <AnimatePresence mode="wait">
            {currentStepConfig.key === 'basicKyc' && (
              <BasicKycStep
                form={form}
                hasAutoPopulatedData={hasAutoPopulatedData}
                completionPercentage={completionPercentage}
                selectedProgram={selectedProgram}
                programs={programs}
                intakes={intakes}
                title={currentStepConfig.title}
              />
            )}

            {currentStepConfig.key === 'education' && (
              <EducationStep
                title={currentStepConfig.title}
                subjects={subjects}
                selectedProgram={selectedProgram}
                selectedGrades={selectedGrades}
                eligibilityCheck={eligibilityCheck}
                recommendedSubjects={recommendedSubjects}
                resultSlipFile={resultSlipFile}
                extraKycFile={extraKycFile}
                uploadProgress={uploadProgress}
                uploadedFiles={uploadedFiles}
                addGrade={handleAddGrade}
                removeGrade={handleRemoveGrade}
                updateGrade={handleUpdateGrade}
                getUsedSubjects={handleGetUsedSubjects}
                handleResultSlipUpload={handleResultSlipUpload}
                handleExtraKycUpload={handleExtraKycUpload}
              />
            )}

            {currentStepConfig.key === 'payment' && (
              <PaymentStep
                title={currentStepConfig.title}
                form={form}
                getPaymentTarget={getPaymentTarget}
                handleProofOfPaymentUpload={handleProofOfPaymentUpload}
                proofOfPaymentFile={popFile}
                uploadProgress={uploadProgress}
                uploadedFiles={uploadedFiles}
              />
            )}

            {currentStepConfig.key === 'submit' && (
              <SubmitStep
                title={currentStepConfig.title}
                form={form}
                subjects={subjects}
                selectedGrades={selectedGrades}
                eligibilityCheck={eligibilityCheck}
                resultSlipFile={resultSlipFile}
                extraKycFile={extraKycFile}
                proofOfPaymentFile={popFile}
                confirmSubmission={confirmSubmission}
                onConfirmChange={setConfirmSubmission}
              />
            )}
          </AnimatePresence>

          <motion.div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 pt-6" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <div className="order-2 sm:order-1">
              {currentStepIndex > 0 && (
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button type="button" variant="outline" onClick={handlePrevStep} className="w-full sm:w-auto" disabled={loading || uploading}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {previousButtonLabel}
                  </Button>
                </motion.div>
              )}
            </div>

            <div className="order-1 sm:order-2">
              {!isLastStep ? (
                <motion.div whileHover={{ scale: loading || uploading ? 1 : 1.05 }} whileTap={{ scale: loading || uploading ? 1 : 0.95 }}>
                  <Button type="button" onClick={handleNextStep} loading={loading || uploading} disabled={loading || uploading} className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed">
                    {loading || uploading ? 'Processing...' : (<><span>Next Step</span><ArrowRight className="h-4 w-4 ml-2" /></>)}
                  </Button>
                </motion.div>
              ) : (
                <motion.div whileHover={{ scale: loading ? 1 : 1.05 }} whileTap={{ scale: loading ? 1 : 0.95 }}>
                  <Button type="submit" loading={loading} disabled={loading || !confirmSubmission} className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                    {loading ? 'Submitting...' : (<><Send className="h-4 w-4 mr-2" />Submit Application</>)}
                  </Button>
                </motion.div>
              )}
            </div>
          </motion.div>
        </form>
      </div>

      <AIAssistant
        applicationData={watchValues()}
        currentStep={currentStepIndex + 1}
        onSuggestionApply={suggestion => {
          console.log('AI Suggestion:', suggestion)
        }}
      />
    </div>
  )
}

export default ApplicationWizard
