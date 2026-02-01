// @ts-nocheck
import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ActiveSessions } from '@/components/ui/ActiveSessions'
import { motion } from 'framer-motion'
import { ArrowLeft, User, Mail, Phone, MapPin, Save, Shield } from 'lucide-react'
import { useProfileAutoPopulation, getBestValue } from '@/hooks/useProfileAutoPopulation'

const optionalString = () => z.string().optional().or(z.literal(''))

const profileSchema = z.object({
  full_name: z.string().min(2, 'Full name must be at least 2 characters'),
  phone: z.string().min(10, 'Please enter a valid phone number').or(z.literal('')).optional(),
  date_of_birth: optionalString(),
  sex: z.enum(['Male', 'Female'], { required_error: 'Please select a sex' }).optional(),
  residence_town: optionalString(),
  nationality: optionalString(),
  next_of_kin_name: optionalString(),
  next_of_kin_phone: optionalString()
})

type ProfileForm = z.infer<typeof profileSchema>

export default function StudentSettings() {
  const { user } = useAuth()
  const { profile, updateProfile } = useProfileQuery()
  const { metadata } = useProfileAutoPopulation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema)
  })

  // Update form values when profile data loads
  React.useEffect(() => {
    if (profile || metadata) {
      setValue('full_name', getBestValue(profile?.full_name, metadata?.full_name, user?.email?.split('@')[0] || ''))
      setValue('phone', getBestValue(profile?.phone, metadata?.phone, ''))
      setValue('date_of_birth', getBestValue(profile?.date_of_birth, metadata?.date_of_birth, ''))
      setValue('sex', (getBestValue(profile?.sex, metadata?.sex, '') as 'Male' | 'Female') || undefined)
      setValue('residence_town', getBestValue(profile?.residence_town, metadata?.residence_town, ''))
      setValue('nationality', getBestValue(profile?.nationality, metadata?.nationality, ''))
      setValue('next_of_kin_name', getBestValue(profile?.next_of_kin_name, metadata?.next_of_kin_name, ''))
      setValue('next_of_kin_phone', getBestValue(profile?.next_of_kin_phone, metadata?.next_of_kin_phone, ''))
    }
  }, [profile, metadata, user?.email, setValue])

  const onSubmit = async (data: ProfileForm) => {
    try {
      setLoading(true)
      setError('')
      setSuccess('')

      // Validate user is authenticated
      if (!user?.id) {
        throw new Error('You must be signed in to update your profile')
      }

      // Clean up empty strings to null
      const cleanData = Object.entries(data).reduce((acc, [key, value]) => {
        acc[key] = value === '' ? null : value
        return acc
      }, {} as any)

      console.log('Updating profile with data:', cleanData)
      await updateProfile(cleanData)
      setSuccess('Profile updated successfully!')
    } catch (error) {
      console.error('Error updating profile:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to update profile'
      setError(`Failed to update profile: ${errorMessage}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    
        <div className="safe-area-bottom py-4 sm:py-6 lg:py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {/* Header - Mobile First */}
        <div className="mb-6 sm:mb-8">
          <Link to="/student/dashboard" className="inline-flex items-center text-primary hover:text-primary/80 mb-4 font-medium transition-colors">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Link>
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-6 sm:p-8 text-white shadow-xl"
          >
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2">
              ⚙️ Profile Settings
            </h1>
            <p className="text-lg sm:text-xl text-white/90">
              Update your personal information and contact details
            </p>
          </motion.div>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-destructive/5 border border-destructive/30 p-4 sm:p-6 mb-6 shadow-lg"
          >
            <div className="flex items-center space-x-3">
              <div className="text-4xl">😱</div>
              <div className="text-error font-medium">{error}</div>
            </div>
          </motion.div>
        )}

        {success && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-green-50 dark:bg-green-900/20 border-2 border-green-500 p-4 sm:p-6 mb-6 shadow-lg"
          >
            <div className="flex items-center space-x-3">
              <div className="text-4xl">✅</div>
              <div className="text-green-700 dark:text-green-300 font-semibold text-lg">{success}</div>
            </div>
          </motion.div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 sm:space-y-8">
          {/* Basic Information */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-card rounded-2xl shadow-lg border border-border p-6"
          >
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2 bg-primary/10 rounded-lg">
                <User className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                <User className="w-5 h-5" /> Basic Information
              </h2>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Input
                {...register('full_name')}
                type="text"
                label="Full Name"
                error={errors.full_name?.message}
                required
                className="form-input-mobile"
              />
              
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-foreground" />
                  <input
                    type="email"
                    value={profile?.email || ''}
                    disabled
                    className="form-input-mobile w-full pl-10 pr-3 py-3 border-2 border-border rounded-xl bg-muted text-gray-900 cursor-not-allowed truncate"
                  />
                </div>
                <p className="mt-2 text-xs text-gray-900 bg-accent px-3 py-1 rounded-lg inline-block">
                  🔒 Email cannot be changed
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
              <Input
                {...register('phone')}
                type="tel"
                label="Phone Number"
                placeholder="+260-123-456-789"
                error={errors.phone?.message}
                className="form-input-mobile"
              />
              
              <Input
                {...register('date_of_birth')}
                type="date"
                label="Date of Birth"
                error={errors.date_of_birth?.message}
                className="form-input-mobile"
              />
              
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Sex
                </label>
                <select
                  {...register('sex')}
                  className="form-input-mobile w-full rounded-xl border-2 border-border bg-card px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-primary"
                >
                  <option value="">Select Sex</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
                {errors.sex && (
                  <p className="mt-2 text-sm text-destructive bg-destructive/5 px-3 py-1 rounded-lg">{errors.sex.message}</p>
                )}
              </div>
            </div>
          </motion.div>

          {/* Address Information */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-card rounded-2xl shadow-lg border border-border p-6"
          >
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2 bg-accent/10 rounded-lg">
                <MapPin className="h-5 w-5 text-accent" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                📍 Address Information
              </h2>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Input
                {...register('residence_town')}
                type="text"
                label="City/Town"
                placeholder="Kitwe"
                error={errors.residence_town?.message}
                className="form-input-mobile"
              />
              
              <Input
                {...register('nationality')}
                type="text"
                label="Nationality"
                placeholder="Zambian"
                error={errors.nationality?.message}
                className="form-input-mobile"
              />
            </div>
          </motion.div>

          {/* Next of Kin */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-card rounded-2xl shadow-lg border border-border p-6"
          >
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2 bg-destructive/10 rounded-lg">
                <Phone className="h-5 w-5 text-destructive" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                👥 Next of Kin
              </h2>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Input
                {...register('next_of_kin_name')}
                type="text"
                label="Next of Kin Name"
                placeholder="Full name of next of kin"
                error={errors.next_of_kin_name?.message}
                className="form-input-mobile"
              />
              
              <Input
                {...register('next_of_kin_phone')}
                type="tel"
                label="Next of Kin Phone"
                placeholder="+260-123-456-789"
                error={errors.next_of_kin_phone?.message}
                className="form-input-mobile"
              />
            </div>
          </motion.div>

          {/* Security & Sessions */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-card rounded-2xl shadow-lg border border-border p-6"
          >
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2 bg-muted rounded-lg">
                <Shield className="h-5 w-5 text-secondary" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                🔐 Security & Active Sessions
              </h2>
            </div>
            
            <ActiveSessions />
          </motion.div>

          {/* Action Buttons */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="flex flex-col sm:flex-row sm:justify-end space-y-3 sm:space-y-0 sm:space-x-4 pt-6"
          >
            <Link to="/student/dashboard" className="w-full sm:w-auto">
              <Button 
                type="button" 
                variant="outline" 
                className="btn-responsive border-2 hover:border-border"
              >
                Cancel
              </Button>
            </Link>
            <Button 
              type="submit" 
              loading={loading}
              className="btn-responsive bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold shadow-lg hover:shadow-xl"
            >
              <Save className="h-4 w-4 mr-2" />
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </motion.div>
        </form>
      </div>
    
  )
}
