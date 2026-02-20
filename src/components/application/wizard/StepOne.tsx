import React from 'react'
import { UseFormRegister, FieldErrors, Control } from 'react-hook-form'
import { Input } from '@/components/ui/Input'
import { FormSelect } from '@/components/ui/form-select'

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
  control: Control<WizardFormData>
  errors: FieldErrors<WizardFormData>
  selectedProgram?: string
}

export const StepOne: React.FC<StepOneProps> = ({ register, control, errors, selectedProgram }) => {
  return (
    <div 
      className="bg-card rounded-lg shadow-lg p-6 border border-border animate-fade-in"
    >
      <h2 className="text-lg font-semibold text-foreground mb-4">
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
        
        <FormSelect
          name="sex"
          control={control}
          options={[
            { value: 'Male', label: 'Male' },
            { value: 'Female', label: 'Female' },
          ]}
          label="Sex"
          placeholder="Select sex"
          error={errors.sex?.message}
          required
        />
        
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
        
        <FormSelect
          name="program"
          control={control}
          options={[
            { value: 'Clinical Medicine', label: 'Clinical Medicine (KATC)' },
            { value: 'Environmental Health', label: 'Environmental Health (KATC)' },
            { value: 'Registered Nursing', label: 'Registered Nursing (MIHAS)' },
          ]}
          label="Program"
          placeholder="Select program"
          error={errors.program?.message}
          required
        />
        
        <FormSelect
          name="intake"
          control={control}
          options={[
            { value: 'January 2025', label: 'January 2025' },
            { value: 'July 2025', label: 'July 2025' },
            { value: 'January 2026', label: 'January 2026' },
            { value: 'July 2026', label: 'July 2026' },
          ]}
          label="Intake"
          placeholder="Select intake"
          error={errors.intake?.message}
          required
        />
      </div>
      
      {selectedProgram && (
        <div 
          className="mt-4 p-4 bg-primary/5 rounded-lg animate-scale-in"
        >
          <p className="text-sm text-primary-foreground">
            <strong>Institution:</strong> {['Clinical Medicine', 'Environmental Health'].includes(selectedProgram) ? 'KATC' : 'MIHAS'}
          </p>
        </div>
      )}
    </div>
  )
}
