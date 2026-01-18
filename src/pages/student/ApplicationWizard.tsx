        {!stepValidation.isValid && !isLastStep && stepValidation.completedFields > 0 && (
          <motion.div className="rounded-md bg-warning/10 border border-warning/30 p-4 mb-6" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-start">
              <Info className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-medium text-warning">Incomplete Step</h3>
                <div className="text-sm text-gray-900 mt-1">
                  You can proceed, but we recommend completing all fields for a better application.
                </div>
                {stepValidation.missingFields.length > 0 && (
                  <ul className="mt-2 text-xs text-caption list-disc list-inside space-y-1">
                    {stepValidation.missingFields.map((field, idx) => (
                      <li key={idx}>{field}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-border p-4 sm:p-6 md:p-8">
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
                  selectedProgram={selectedProgramDetails?.name}
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
                  getPaymentTarget={async () => getPaymentTarget()}
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
                  selectedProgramName={selectedProgramDetails?.name}
                  selectedInstitutionLabel={
                    selectedProgramDetails?.institutions?.full_name ||
                    selectedProgramDetails?.institutions?.name ||
                    undefined
                  }
                />
              )}
                </AnimatePresence>

                <motion.div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-6 border-t border-border mt-8" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
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
                    <Button type="button" onClick={handleNextStep} loading={loading || uploading} disabled={loading || uploading} className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed">
                      {loading || uploading ? 'Processing...' : (<><span>Next Step</span><ArrowRight className="h-4 w-4 ml-2" /></>)}
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div whileHover={{ scale: loading ? 1 : 1.05 }} whileTap={{ scale: loading ? 1 : 0.95 }}>
                    <Button type="submit" loading={loading} disabled={loading || !confirmSubmission} className="w-full sm:w-auto bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                      {loading ? 'Submitting...' : (<><Send className="h-4 w-4 mr-2" />Submit Application</>)}
                    </Button>
                  </motion.div>
                )}
                </div>
                </motion.div>
              </form>
            </div>
          </div>
