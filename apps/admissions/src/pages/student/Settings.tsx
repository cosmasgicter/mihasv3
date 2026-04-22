import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Seo } from '@/components/seo/Seo'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from '@/lib/zod'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useToastStore } from '@/hooks/useToast'
import { Button } from '@/components/ui/Button'
import { FormSelect } from '@/components/ui/form-select'
import { Input } from '@/components/ui/input'
import { ActiveSessions } from '@/components/ui/ActiveSessions'
import { SectionCard } from '@/components/ui/SectionCard'
import { PageShell } from '@/components/ui/PageShell'
import {
  ArrowLeft,
  Bell,
  Mail,
  MapPin,
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
import {
  getResidenceTownHelperText,
  normalizeResidenceTown,
  RESIDENCE_TOWN_LABEL,
  RESIDENCE_TOWN_MIN_LENGTH_MESSAGE,
} from '@/lib/residenceTown'
import { NATIONALITY_OPTIONS, DEFAULT_NATIONALITY } from '@/lib/nationalityOptions'

const optionalString = () => z.string().optional().or(z.literal(''))

const profileSchema = z.object({
  full_name: z.string().min(2, 'Full name must be at least 2 characters'),
  phone: z.string().min(10, 'Please enter a valid phone number').or(z.literal('')).optional(),
  date_of_birth: optionalString(),
  sex: z.enum(['Male', 'Female'], { error: 'Please select a sex' }).optional(),
  residence_town: z
    .string()
    .transform(normalizeResidenceTown)
    .refine(value => value.length === 0 || value.length >= 2, RESIDENCE_TOWN_MIN_LENGTH_MESSAGE)
    .optional(),
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
  const navigate = useNavigate()
  const { user } = useAuth()
  const { profile, updateProfile, updatingProfile } = useProfileQuery()
  const { metadata } = useProfileAutoPopulation()
  const toast = useToastStore()
  const profileEditingEnabled = true
  const [saveStatus, setSaveStatus] = React.useState<{ tone: 'success' | 'error'; message: string } | null>(null)

  const {
    register,
    setValue,
    reset,
    watch,
    getValues,
    setError,
    handleSubmit,
    control,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema) as never,
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

  const onSubmit = handleSubmit(async (formValues) => {
    setSaveStatus(null)

    // Extract only the dirty fields
    const dirtyFieldValues: Partial<ProfileForm> = {}
    for (const key of Object.keys(dirtyFields) as (keyof ProfileForm)[]) {
      dirtyFieldValues[key] = formValues[key] as never
    }

    if (Object.keys(dirtyFieldValues).length === 0) return

    try {
      const updatedProfile = await updateProfile(dirtyFieldValues)
      setSaveStatus({
        tone: 'success',
        message: 'Profile changes saved successfully.',
      })
      toast.success('Profile updated', 'Your changes have been saved.')
      // Reset form dirty state with explicit field-by-field merge to prevent null/undefined gaps
      reset({
        full_name: updatedProfile.full_name ?? formValues.full_name,
        phone: updatedProfile.phone ?? formValues.phone ?? '',
        date_of_birth: normalizeDateInputValue(updatedProfile.date_of_birth ?? formValues.date_of_birth ?? ''),
        sex: (updatedProfile.sex as 'Male' | 'Female') ?? formValues.sex,
        residence_town: updatedProfile.residence_town ?? formValues.residence_town ?? '',
        country: updatedProfile.country ?? formValues.country ?? '',
        nrc_number: (updatedProfile.nrc_number as string | undefined) ?? formValues.nrc_number ?? '',
        address: updatedProfile.address ?? formValues.address ?? '',
        nationality: updatedProfile.nationality ?? formValues.nationality ?? 'Zambian',
        next_of_kin_name: updatedProfile.next_of_kin_name ?? formValues.next_of_kin_name ?? '',
        next_of_kin_phone: updatedProfile.next_of_kin_phone ?? formValues.next_of_kin_phone ?? '',
      })
    } catch (error: unknown) {
      const err = error as Error & { fieldErrors?: Record<string, string> }
      if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        setSaveStatus({
          tone: 'error',
          message: 'Please correct the highlighted fields and try again.',
        })
        Object.entries(err.fieldErrors).forEach(([field, message]) => {
          setError(field as keyof ProfileForm, { type: 'server', message })
        })
      } else {
        setSaveStatus({
          tone: 'error',
          message: 'Something went wrong while saving your profile. Please try again.',
        })
        toast.error('Save failed', 'Something went wrong. Please try again.')
      }
    }
  })

  const notificationPhone =
    currentPhone?.trim() ||
    profile?.phone?.trim() ||
    metadata?.phone?.trim() ||
    ''

  const confirmDiscardChanges = React.useCallback(() => {
    if (!isDirty) {
      return true
    }

    return window.confirm('You have unsaved changes. Leave this page and discard them?')
  }, [isDirty])

  const handleNavigate = React.useCallback((path: string) => {
    if (confirmDiscardChanges()) {
      navigate(path)
    }
  }, [confirmDiscardChanges, navigate])

  React.useEffect(() => {
    if (!isDirty) {
      return undefined
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  return (
    <>
      <Seo
        title="My Settings | MIHAS-KATC Admissions"
        description="Manage your profile details, residence information, and security settings for your MIHAS-KATC admissions account."
        path="/student/settings"
        noindex
      />
    <PageShell
      title="Profile and security settings"
      subtitle="Review your account details, residence information, notification contact, and active sessions before you continue with applications and payments."
      eyebrow="Profile"
      tone="student"
      metrics={[
        { label: 'Profile status', value: isDirty ? 'Unsaved changes' : 'Up to date', helper: 'Form edit state for this session' },
        { label: 'Notifications', value: 'Managed', helper: 'Channel preferences available from the linked page' },
        { label: 'Sessions', value: 'Managed', helper: 'Review and revoke active browser sessions below' },
        { label: 'Country', value: watch('country') || 'Not set', helper: 'Residence country currently selected' },
      ]}
      actions={
        <Button type="button" variant="secondary" onClick={() => handleNavigate('/student/notifications')}>
          <Bell className="h-4 w-4" />
          Manage notifications
        </Button>
      }
    >
      <div className="space-y-6 sm:space-y-8">
        <button
          type="button"
          onClick={() => handleNavigate('/student/dashboard')}
          className="inline-flex items-center text-primary transition-colors hover:text-primary/80"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to dashboard
        </button>

        <form className="space-y-6" onSubmit={onSubmit}>
          {saveStatus && (
            <div
              role={saveStatus.tone === 'error' ? 'alert' : 'status'}
              aria-live={saveStatus.tone === 'error' ? 'assertive' : 'polite'}
              className={
                saveStatus.tone === 'error'
                  ? 'rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive'
                  : 'rounded-2xl border border-success/30 bg-success/5 px-4 py-3 text-sm text-success'
              }
            >
              {saveStatus.message}
            </div>
          )}

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
                autoComplete="name"
                helperText="Use the same name you want admissions to see on your records."
                error={errors.full_name?.message}
                disabled={!profileEditingEnabled}
                required
              />

              <Input
                type="email"
                label="Account email"
                value={profile?.email || user?.email || ''}
                autoComplete="email"
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
                autoComplete="tel"
                placeholder="+260-123-456-789"
                helperText="This number is reused for SMS notification delivery."
                error={errors.phone?.message}
                disabled={!profileEditingEnabled}
              />

              <Input
                {...register('date_of_birth')}
                type="date"
                label="Date of birth"
                autoComplete="bday"
                error={errors.date_of_birth?.message}
                disabled={!profileEditingEnabled}
              />

              <FormSelect
                name="sex"
                control={control}
                label="Sex"
                options={sexOptions}
                placeholder="Select sex"
                error={errors.sex?.message}
                disabled={!profileEditingEnabled}
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
                disabled={loadingCountries || !profileEditingEnabled}
                helperText="Defaults to Zambia. Change it only if you currently live elsewhere."
              />

              <div>
                <Input
                  {...register('residence_town', { setValueAs: normalizeResidenceTown })}
                  list={residenceTownDatalistId}
                  type="text"
                  label={RESIDENCE_TOWN_LABEL}
                  autoComplete="address-level2"
                  placeholder={selectedCountry === DEFAULT_RESIDENCE_COUNTRY ? 'Kitwe' : 'Start typing your city or town'}
                  helperText={getResidenceTownHelperText({
                    loadingCities,
                    selectedCountry,
                    defaultCountry: DEFAULT_RESIDENCE_COUNTRY,
                  })}
                  error={errors.residence_town?.message}
                  disabled={!profileEditingEnabled}
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
                disabled={!profileEditingEnabled}
              />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
              <Input
                {...register('nrc_number')}
                type="text"
                label="NRC number"
                autoComplete="off"
                spellCheck={false}
                placeholder="123456/78/1"
                helperText="Use your national registration card number as it appears on official records."
                error={errors.nrc_number?.message}
                disabled={!profileEditingEnabled}
              />

              <Input
                {...register('address')}
                type="text"
                label="Residential address"
                autoComplete="street-address"
                placeholder="Plot, street, area"
                helperText="This is used for identity and residence verification during application review."
                error={errors.address?.message}
                disabled={!profileEditingEnabled}
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
                autoComplete="name"
                placeholder="Full name of your emergency contact"
                error={errors.next_of_kin_name?.message}
                disabled={!profileEditingEnabled}
              />

              <Input
                {...register('next_of_kin_phone')}
                type="tel"
                label="Next of kin phone"
                autoComplete="tel"
                placeholder="+260-123-456-789"
                error={errors.next_of_kin_phone?.message}
                disabled={!profileEditingEnabled}
              />
            </div>
          </SectionCard>

          <SectionCard
            title="Notification delivery"
            description="Portal inbox notifications stay available in-app, while SMS delivery uses the phone number stored on this profile."
            icon={<Bell className="h-5 w-5" />}
            actions={
              <Button type="button" variant="outline" size="sm" onClick={() => handleNavigate('/student/notifications')}>
                Open notification preferences
              </Button>
            }
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-border bg-muted/40 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delivery phone</p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {getDisplayValue(notificationPhone, 'No phone number on file')}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/40 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">In-app inbox</p>
                <p className="mt-2 text-sm font-semibold text-foreground">Always available in the portal</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/40 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Channel controls</p>
                <p className="mt-2 text-sm font-semibold text-foreground">SMS delivery settings</p>
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
            {isDirty && (
              <p className="text-sm text-muted-foreground md:mr-auto md:self-center">
                You have unsaved changes.
              </p>
            )}
            <Button type="button" variant="outline" className="w-full md:w-auto" onClick={() => handleNavigate('/student/dashboard')}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!isDirty || updatingProfile}
              variant="gradient"
              className="w-full md:w-auto"
              loading={updatingProfile}
            >
              {updatingProfile ? 'Saving…' : (
                <>
                  <Save className="h-4 w-4" />
                  Save changes
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </PageShell>
    </>
  )
}
