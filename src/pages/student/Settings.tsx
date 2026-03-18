// @ts-nocheck
import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { Button } from '@/components/ui/Button'
import { FormSelect } from '@/components/ui/form-select'
import { Input } from '@/components/ui/input'
import { ActiveSessions } from '@/components/ui/ActiveSessions'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionCard } from '@/components/ui/SectionCard'
import { PageShell } from '@/components/ui/PageShell'
import {
  ArrowLeft,
  Bell,
  Globe2,
  Mail,
  MapPin,
  Phone,
  Save,
  Shield,
  User,
  Users,
} from 'lucide-react'
import { useProfileAutoPopulation, getBestValue } from '@/hooks/useProfileAutoPopulation'
import { useResidenceLocationOptions } from '@/hooks/useResidenceLocationOptions'
import { DEFAULT_RESIDENCE_COUNTRY } from '@/lib/locationOptions'
import {
  getCanonicalResidenceCountry,
  getCanonicalResidenceTown,
  normalizeDateInputValue,
} from '@/lib/profileFieldMapping'
import { NATIONALITY_OPTIONS, DEFAULT_NATIONALITY } from '@/lib/nationalityOptions'

const optionalString = () => z.string().optional().or(z.literal(''))

const profileSchema = z.object({
  full_name: z.string().min(2, 'Full name must be at least 2 characters'),
  phone: z.string().min(10, 'Please enter a valid phone number').or(z.literal('')).optional(),
  date_of_birth: optionalString(),
  sex: z.enum(['Male', 'Female'], { required_error: 'Please select a sex' }).optional(),
  residence_town: optionalString(),
  country: optionalString(),
  nrc_number: optionalString(),
  address: optionalString(),
  nationality: z.string().min(1, 'Nationality is required').default('Zambian'),
  next_of_kin_name: optionalString(),
  next_of_kin_phone: optionalString(),
})

type ProfileForm = z.infer<typeof profileSchema>

const sexOptions = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
]

function getDisplayValue(value?: string | null, fallback = 'Not provided') {
  return value && value.trim().length > 0 ? value : fallback
}

export default function StudentSettings() {
  const { user } = useAuth()
  const { profile, updateProfile } = useProfileQuery()
  const { metadata } = useProfileAutoPopulation()
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const profileMutation = useMutation({
    mutationFn: async (data: ProfileForm) => {
      if (!user?.id) {
        throw new Error('You must be signed in to update your profile')
      }

      const cleanData = Object.entries(data).reduce((acc, [key, value]) => {
        acc[key] = value === '' ? null : value
        return acc
      }, {} as Record<string, string | null>)

      await updateProfile(cleanData)
    },
    onSuccess: () => {
      setError('')
      setSuccess('Your profile details were saved successfully.')
    },
    onError: (requestError: Error) => {
      setSuccess('')
      setError(`Failed to update profile: ${requestError.message}`)
    },
  })

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
    getValues,
    control,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      country: DEFAULT_RESIDENCE_COUNTRY,
      nrc_number: '',
      address: '',
      nationality: DEFAULT_NATIONALITY,
    },
  })

  const selectedCountry = watch('country')
  const currentPhone = watch('phone')
  const { countryOptions, cityOptions, loadingCountries, loadingCities } = useResidenceLocationOptions(selectedCountry)
  const residenceTownDatalistId = 'settings-residence-town-options'
  const hasHydratedInitialValues = React.useRef(false)

  React.useEffect(() => {
    if (!profile && !metadata) {
      return
    }

    const hydratedValues: ProfileForm = {
      ...getValues(),
      full_name: getBestValue(profile?.full_name, metadata?.full_name, user?.email?.split('@')[0] || ''),
      phone: getBestValue(profile?.phone, metadata?.phone, ''),
      date_of_birth: normalizeDateInputValue(getBestValue(profile?.date_of_birth, metadata?.date_of_birth, '')),
      sex: (getBestValue(profile?.sex, metadata?.sex, '') as 'Male' | 'Female') || undefined,
      residence_town: getCanonicalResidenceTown(profile, metadata),
      country: getCanonicalResidenceCountry(profile, metadata),
      nrc_number: getBestValue(profile?.nrc_number, metadata?.nrc_number, ''),
      address: getBestValue(profile?.address, metadata?.address, ''),
      nationality: getBestValue(profile?.nationality, metadata?.nationality, '') || DEFAULT_NATIONALITY,
      next_of_kin_name: getBestValue(profile?.next_of_kin_name, metadata?.next_of_kin_name, ''),
      next_of_kin_phone: getBestValue(profile?.next_of_kin_phone, metadata?.next_of_kin_phone, ''),
    }

    if (!hasHydratedInitialValues.current) {
      reset(hydratedValues)
      hasHydratedInitialValues.current = true
      return
    }

    const fieldEntries = Object.entries(hydratedValues) as [keyof ProfileForm, ProfileForm[keyof ProfileForm]][]
    fieldEntries.forEach(([fieldName, nextValue]) => {
      const canAutopopulateField = !isDirty || !dirtyFields[fieldName]
      if (canAutopopulateField) {
        setValue(fieldName, nextValue, {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: false,
        })
      }
    })
  }, [profile, metadata, user?.email, getValues, reset, setValue, isDirty, dirtyFields])

  const notificationPhone =
    currentPhone?.trim() ||
    profile?.phone?.trim() ||
    metadata?.phone?.trim() ||
    ''

  const onSubmit = async (data: ProfileForm) => {
    setError('')
    setSuccess('')
    profileMutation.mutate(data)
  }

  return (
    <PageShell
      title="Profile and security settings"
      subtitle="Keep your account details, residence information, notification contact, and active sessions aligned before you continue with applications and payments."
      actions={
        <Button asChild variant="secondary">
          <Link to="/student/notifications">
            <Bell className="h-4 w-4" />
            Manage notifications
          </Link>
        </Button>
      }
    >
      <div className="space-y-6 sm:space-y-8">
        <Link
          to="/student/dashboard"
          className="inline-flex items-center text-primary transition-colors hover:text-primary/80"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to dashboard
        </Link>

        {error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm font-medium text-destructive shadow-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-2xl border border-success/30 bg-success/5 px-5 py-4 text-sm font-medium text-success shadow-sm">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <SectionCard
            title="Applicant profile"
            description="These are the core account details that appear throughout the student portal."
            icon={<User className="h-5 w-5" />}
          >
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Input
                {...register('full_name')}
                type="text"
                label="Full name"
                helperText="Use the same name you want admissions to see on your records."
                error={errors.full_name?.message}
                required
              />

              <Input
                type="email"
                label="Account email"
                value={profile?.email || user?.email || ''}
                helperText="Your sign-in email is fixed for this account."
                disabled
                icon={<Mail className="h-4 w-4" />}
              />
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              <Input
                {...register('phone')}
                type="tel"
                label="Phone number"
                placeholder="+260-123-456-789"
                helperText="This number is reused for SMS and WhatsApp notification delivery."
                error={errors.phone?.message}
              />

              <Input
                {...register('date_of_birth')}
                type="date"
                label="Date of birth"
                error={errors.date_of_birth?.message}
              />

              <FormSelect
                name="sex"
                control={control}
                label="Sex"
                options={sexOptions}
                placeholder="Select sex"
                error={errors.sex?.message}
              />
            </div>
          </SectionCard>

          <SectionCard
            title="Residence and identity"
            description="These details feed the application wizard so your residence data does not drift from your student profile."
            icon={<MapPin className="h-5 w-5" />}
          >
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <FormSelect
                name="country"
                control={control}
                label="Country of residence"
                options={countryOptions}
                placeholder="Select country"
                error={errors.country?.message}
                disabled={loadingCountries}
                helperText="Defaults to Zambia. Change it only if you currently live elsewhere."
              />

              <div>
                <Input
                  {...register('residence_town')}
                  list={residenceTownDatalistId}
                  type="text"
                  label="City or town"
                  placeholder={selectedCountry === DEFAULT_RESIDENCE_COUNTRY ? 'Kitwe' : 'Start typing your city or town'}
                  helperText={
                    loadingCities
                      ? 'Loading city and town options...'
                      : `Suggestions are filtered for ${selectedCountry || DEFAULT_RESIDENCE_COUNTRY}. You can still type your town manually.`
                  }
                  error={errors.residence_town?.message}
                />
                <datalist id={residenceTownDatalistId}>
                  {cityOptions.map((option) => (
                    <option key={option.value} value={option.value} />
                  ))}
                </datalist>
              </div>

              <FormSelect
                name="nationality"
                control={control}
                label="Nationality"
                options={NATIONALITY_OPTIONS}
                placeholder="Select nationality"
                error={errors.nationality?.message}
              />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
              <Input
                {...register('nrc_number')}
                type="text"
                label="NRC number"
                placeholder="123456/78/1"
                helperText="Use your national registration card number as it appears on official records."
                error={errors.nrc_number?.message}
              />

              <Input
                {...register('address')}
                type="text"
                label="Residential address"
                placeholder="Plot, street, area"
                helperText="This is used for identity and residence verification during application review."
                error={errors.address?.message}
              />
            </div>
          </SectionCard>

          <SectionCard
            title="Emergency contact"
            description="Provide a trusted contact in case the admissions team cannot reach you directly."
            icon={<Users className="h-5 w-5" />}
          >
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Input
                {...register('next_of_kin_name')}
                type="text"
                label="Next of kin name"
                placeholder="Full name of your emergency contact"
                error={errors.next_of_kin_name?.message}
              />

              <Input
                {...register('next_of_kin_phone')}
                type="tel"
                label="Next of kin phone"
                placeholder="+260-123-456-789"
                error={errors.next_of_kin_phone?.message}
              />
            </div>
          </SectionCard>

          <SectionCard
            title="Notification delivery"
            description="Portal inbox notifications stay available in-app, while SMS and WhatsApp delivery use the phone number stored on this profile."
            icon={<Bell className="h-5 w-5" />}
            actions={
              <Button asChild variant="outline" size="sm">
                <Link to="/student/notifications">Open notification preferences</Link>
              </Button>
            }
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-border bg-muted/40 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delivery phone</p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {getDisplayValue(notificationPhone, 'Add a phone number above')}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/40 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">In-app inbox</p>
                <p className="mt-2 text-sm font-semibold text-foreground">Always available in the portal</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/40 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Channel controls</p>
                <p className="mt-2 text-sm font-semibold text-foreground">SMS, WhatsApp, and push settings</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Security and active sessions"
            description="Review every device currently signed in to your account and revoke any session you do not recognize."
            icon={<Shield className="h-5 w-5" />}
          >
            <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              Terminating another session signs that device out without affecting the current page. Use this after shared-device access or if you notice an unfamiliar browser or IP address.
            </div>
            <ActiveSessions />
          </SectionCard>

          <div className="flex flex-col gap-3 md:flex-row md:justify-end">
            <Button asChild variant="outline" className="w-full md:w-auto">
              <Link to="/student/dashboard">Cancel</Link>
            </Button>
            <Button type="submit" loading={profileMutation.isPending} variant="gradient" className="w-full md:w-auto">
              <Save className="h-4 w-4" />
              {profileMutation.isPending ? 'Saving changes...' : 'Save profile changes'}
            </Button>
          </div>
        </form>
      </div>
    </PageShell>
  )
}
