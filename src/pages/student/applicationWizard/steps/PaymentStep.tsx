import type { ChangeEvent } from 'react'

import { motion } from 'framer-motion'
import { CheckCircle, CreditCard } from 'lucide-react'
import type { UseFormReturn } from 'react-hook-form'

import { Input } from '@/components/ui/Input'

import type { WizardFormData } from '../types'

interface PaymentStepProps {
  title: string
  form: UseFormReturn<WizardFormData>
  getPaymentTarget: () => string
  handleProofOfPaymentUpload: (event: ChangeEvent<HTMLInputElement>) => void
  proofOfPaymentFile: File | null
  uploadProgress: Record<string, number>
  uploadedFiles: Record<string, boolean>
}

const PaymentStep = ({
  title,
  form,
  getPaymentTarget,
  handleProofOfPaymentUpload,
  proofOfPaymentFile,
  uploadProgress,
  uploadedFiles
}: PaymentStepProps) => {
  const { register } = form

  return (
    <motion.div
      key="step3"
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.3 }}
      className="bg-white rounded-lg shadow-lg p-6 border border-gray-100"
      data-testid="payment-step"
    >
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>

      <div className="space-y-6">
        <motion.div
          className="bg-gradient-to-r from-blue-50 to-green-50 border border-blue-200 rounded-lg p-4"
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.2 }}
        >
          <div className="flex items-center mb-3">
            <CreditCard className="h-5 w-5 text-blue-600 mr-2" />
            <h3 className="text-md font-medium text-blue-800">
              Payment Required - Multiple Options Available
            </h3>
          </div>
          <div className="space-y-2 text-sm">
            <p className="text-blue-700">
              <strong>Application Fee:</strong> K153.00
            </p>
            <p className="text-blue-700">
              <strong>Payment Target:</strong> {getPaymentTarget()}
            </p>
            <div className="bg-white rounded-md p-3 mt-3">
              <p className="text-gray-700 font-medium mb-2">Available Payment Methods:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="flex items-center text-green-600">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                  MTN Money
                </div>
                <div className="flex items-center text-red-600">
                  <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                  Airtel Money (Cross Network)
                </div>
                <div className="flex items-center text-blue-600">
                  <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                  Zamtel Money (Cross Network)
                </div>
                <div className="flex items-center text-purple-600">
                  <span className="w-2 h-2 bg-purple-500 rounded-full mr-2"></span>
                  Ewallet
                </div>
                <div className="flex items-center text-orange-600">
                  <span className="w-2 h-2 bg-orange-500 rounded-full mr-2"></span>
                  Bank To Cell
                </div>
              </div>
            </div>
            <p className="text-green-700 font-medium">✓ Secure payment processing</p>
            <p className="text-green-700 font-medium">✓ Instant payment verification</p>
            <p className="text-green-700 font-medium">✓ Automated receipt generation</p>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <label htmlFor="payment_method" className="block text-sm font-medium text-gray-700 mb-1">
              Payment Method <span className="text-red-500">*</span>
            </label>
            <select
              {...register('payment_method')}
              id="payment_method"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              defaultValue="MTN Money"
            >
              <option value="MTN Money">MTN Money</option>
              <option value="Airtel Money">Airtel Money (Cross Network)</option>
              <option value="Zamtel Money">Zamtel Money (Cross Network)</option>
              <option value="Ewallet">Ewallet</option>
              <option value="Bank To Cell">Bank To Cell</option>
            </select>
          </div>

          <div>
            <Input
              {...register('payer_name')}
              label="Payer Name"
              placeholder="Name of person who made payment"
            />
          </div>

          <div>
            <Input
              {...register('payer_phone')}
              label="Payer Phone"
              placeholder="Phone number used for payment"
            />
          </div>

          <div>
            <Input
              type="number"
              {...register('amount', { valueAsNumber: true })}
              label="Amount Paid"
              defaultValue={153}
              min={153}
            />
          </div>

          <div>
            <Input
              type="datetime-local"
              {...register('paid_at')}
              label="Payment Date & Time"
            />
          </div>

          <div>
            <Input
              {...register('momo_ref')}
              label="Mobile Money Reference (Optional)"
              placeholder="Transaction reference number"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Proof of Payment <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleProofOfPaymentUpload}
              className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {proofOfPaymentFile && (
              <div className="mt-2 flex items-center text-sm text-green-600">
                <CheckCircle className="h-4 w-4 mr-1" />
                {proofOfPaymentFile.name}
              </div>
            )}
            {uploadProgress.proof_of_payment !== undefined && (
              <div className="mt-2">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>Uploading...</span>
                  <span>{uploadProgress.proof_of_payment}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <motion.div
                    className="bg-blue-600 h-2 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress.proof_of_payment}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            )}
            {uploadedFiles.proof_of_payment && (
              <motion.div
                className="mt-2 text-sm text-green-600"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                ✓ Upload complete!
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default PaymentStep
