import React from 'react'
import { Button } from './Button'
import { CheckCircle, Edit, X } from 'lucide-react'
import { ProfileData } from '@/forms/applicationSchema'

interface DataPopulationConfirmationProps {
  profileData: ProfileData
  onConfirm: () => void
  onEdit: () => void
  onSkip: () => void
  isVisible: boolean
}

export function DataPopulationConfirmation({
  profileData,
  onConfirm,
  onEdit,
  onSkip,
  isVisible
}: DataPopulationConfirmationProps) {
  if (!isVisible) return null

  const populatedFields = [
    { label: 'Date of Birth', value: profileData.date_of_birth },
    { label: 'Sex', value: profileData.sex },
    { label: 'Nationality', value: profileData.nationality },
    { label: 'Address', value: profileData.address },
    { label: 'Next of Kin Name', value: profileData.next_of_kin_name },
    { label: 'Next of Kin Phone', value: profileData.next_of_kin_phone }
  ].filter(field => field.value)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <div className="flex items-center space-x-3 mb-4">
            <CheckCircle className="h-6 w-6 text-green-500" />
            <h3 className="text-lg font-semibold text-gray-900">
              Auto-Fill Detected
            </h3>
          </div>
          
          <p className="text-sm text-gray-600 mb-4">
            We found information in your profile that can be used to pre-fill this application. 
            Please review and confirm the accuracy of this data:
          </p>
          
          <div className="space-y-2 mb-6">
            {populatedFields.map((field, index) => (
              <div key={index} className="flex justify-between text-sm">
                <span className="font-medium text-gray-700">{field.label}:</span>
                <span className="text-gray-600">{field.value}</span>
              </div>
            ))}
          </div>
          
          <div className="flex space-x-3">
            <Button
              onClick={onConfirm}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Use This Data
            </Button>
            <Button
              onClick={onEdit}
              variant="outline"
              className="flex-1"
            >
              <Edit className="h-4 w-4 mr-2" />
              Review & Edit
            </Button>
            <Button
              onClick={onSkip}
              variant="ghost"
              size="sm"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}