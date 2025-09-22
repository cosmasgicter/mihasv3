import React from 'react'
import { UseFormRegister, FieldErrors } from 'react-hook-form'
import { Input } from '@/components/ui/Input'
import { motion } from 'framer-motion'

interface WizardFormData {
  full_name: string
  nrc_number?: string
  passport_number?: string
  date_of_birth: string
  sex: 'Male' | 'Female'
  phone: string
  email: string
  residence_town: string
  next_of_kin_name?: string
  next_of_kin_phone?: string
  program: 'Clinical Medicine' | 'Environmental Health' | 'Registered Nursing'
  intake: string
}

interface StepOneProps {
  register: UseFormRegister<WizardFormData>
  errors: FieldErrors<WizardFormData>
  selectedProgram?: string
}

export const StepOne: React.FC<StepOneProps> = ({ register, errors, selectedProgram }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.3 }}
      className="bg-white rounded-lg shadow-lg p-6 border border-gray-100"
    >
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Step 1: Basic KYC Information
      </h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="lg:col-span-2">
          <Input
            {...register('full_name')}
            label="Full Name"
            error={errors.full_name?.message}
            required
            autoComplete="name"
          />
        </div>
        
        <div>
          <Input
            {...register('nrc_number')}
            label="NRC Number"
            placeholder="123456/12/1"
            error={errors.nrc_number?.message}
            autoComplete="off"
          />
        </div>
        
        <div>
          <Input
            {...register('passport_number')}
            label="Passport Number"
            placeholder="Enter passport number"
            error={errors.passport_number?.message}
            autoComplete="off"
          />
        </div>
        
        <div>
          <Input
            type="date"
            {...register('date_of_birth')}
            label="Date of Birth"
            error={errors.date_of_birth?.message}
            required
            autoComplete="bday"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Sex <span className="text-red-500">*</span>
          </label>
          <select
            {...register('sex')}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            autoComplete="sex"
          >
            <option value="">Select sex</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
          {errors.sex && (
            <p className="mt-1 text-sm text-red-600">{errors.sex.message}</p>
          )}
        </div>
        
        <div>
          <Input
            {...register('phone')}
            label="Phone Number"
            placeholder="0977123456"
            error={errors.phone?.message}
            required
            autoComplete="tel"
          />
        </div>
        
        <div>
          <Input
            type="email"
            {...register('email')}
            label="Email Address"
            error={errors.email?.message}
            required
            autoComplete="email"
          />
        </div>
        
        <div>
          <Input
            {...register('residence_town')}
            label="Residence Town"
            error={errors.residence_town?.message}
            required
            autoComplete="address-level2"
          />
        </div>
        
        <div>
          <Input
            {...register('next_of_kin_name')}
            label="Next of Kin Name (Optional)"
            error={errors.next_of_kin_name?.message}
            autoComplete="off"
          />
        </div>
        
        <div>
          <Input
            {...register('next_of_kin_phone')}
            label="Next of Kin Phone (Optional)"
            error={errors.next_of_kin_phone?.message}
            autoComplete="off"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Program <span className="text-red-500">*</span>
          </label>
          <select
            {...register('program')}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select program</option>
            <option value="Clinical Medicine">Clinical Medicine (KATC)</option>
            <option value="Environmental Health">Environmental Health (KATC)</option>
            <option value="Registered Nursing">Registered Nursing (MIHAS)</option>
          </select>
          {errors.program && (
            <p className="mt-1 text-sm text-red-600">{errors.program.message}</p>
          )}
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Intake <span className="text-red-500">*</span>
          </label>
          <select
            {...register('intake')}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select intake</option>
            <option value="January 2025">January 2025</option>
            <option value="July 2025">July 2025</option>
            <option value="January 2026">January 2026</option>
            <option value="July 2026">July 2026</option>
          </select>
          {errors.intake && (
            <p className="mt-1 text-sm text-red-600">{errors.intake.message}</p>
          )}
        </div>
      </div>
      
      {selectedProgram && (
        <motion.div 
          className="mt-4 p-4 bg-blue-50 rounded-lg"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <p className="text-sm text-blue-800">
            <strong>Institution:</strong> {['Clinical Medicine', 'Environmental Health'].includes(selectedProgram) ? 'KATC' : 'MIHAS'}
          </p>
        </motion.div>
      )}
    </motion.div>
  )
}