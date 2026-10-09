import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Seo } from '@/components/seo/Seo'
import { usePortalBrand } from '@/hooks/usePortalBrand'
import { brandedPageTitle } from '@/lib/tenantBrandCopy'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from '@/lib/zod'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useToastStore } from '@/hooks/useToast'
import { onSettingsMount } from '@/lib/speculativePrefetch'
import { Button, Skeleton } from '@/components/ui'
import { FormSelect } from '@/components/ui/form-select'
import { Input } from '@/components/ui/input'
import { ActiveSessions } from '@/components/ui/ActiveSessions'
import { SectionCard } from '@/components/ui/SectionCard'
import { PageShell } from '@/components/ui/PageShell'
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  CloudOff,
  Loader2,
  Mail,
  MapPin,
  RefreshCw,
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
import {
  buildProfileResetValues,
  extractSectionDelta,
  isAlignedZambianPhone,
  PROFILE_SECTIONS,
  PROFILE_SECTION_IDS,
  sectionForField,
  type ProfileSectionId,
  type SectionSaveStatus,
} from '@/lib/profileAutosave'
import {
  useProfileSectionAutosave,
  type ProfileAutosaveResult,
} from '@/hooks/student/useProfileSectionAutosave'
import type { UserProfile } from '@/types/auth'

const optionalString = (max?: number) => {
  const base = max ? z.string().max(max, `Must be at most ${max} characters`) : z.string()
  return base.optional().or(z.literal(''))
}

// Field validation is aligned with the backend ProfileUpdateSerializer
// (max lengths) and validate_zambian_phone (+260 followed by 9 digits).
const profileSchema = z.object({
  full_name: z
    .string()
    .min(2, 'Full name must be at least 2 characters')
    .max(255, 'Full name must be at most 255 characters'),
  phone: z
    .string()
    .optional()
    .transform((value) => (value ?? '').trim())
    .refine(
      (value) => value.length === 0 || isAlignedZambianPhone(value),
      'Enter a Zambian number in the format +260970000000',
    ),
  date_of_birth: optionalString(),
  sex: z.enum(['Male', 'Female'], { error: 'Please select a sex' }).optional(),
  residence_town: z
    .string()
    .transform(normalizeResidenceTown)
    .refine(value => value.length === 0 || value.length >= 2, RESIDENCE_TOWN_MIN_LENGTH_MESSAGE)
    .optional(),
  country: optionalString(255),
  nrc_number: optionalString(20),
  address: optionalString(),
  nationality: z
    .string()
    .min(1, 'Nationality is required')
    .max(100, 'Nationality must be at most 100 characters')
    .default('Zambian'),
  next_of_kin_name: optionalString(255),
  next_of_kin_phone: optionalString(50),
})

type ProfileForm = z.infer<typeof profileSchema>

const sexOptions = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
]

const SECTION_LABELS: Record<ProfileSectionId, string> = {
  applicant: 'Applicant profile',
  residence: 'Residence and identity',
  emergency: 'Emergency contact',
}

interface SaveIndicatorProps {
  status: SectionSaveStatus
  error: string | null
}

/**
 * Accessible inline save-state indicator. Every non-idle state pairs a colour
 * with an icon + label (never colour alone) and announces politely so the
 * autosave state stays understandable under zoom/reduced-motion/offline.
 */
function SaveIndicator({ status, error }: SaveIndicatorProps) {
  if (status === 'idle') return null

  const config: Record<
    Exclude<SectionSaveStatus, 'idle'>,
    { label: string; className: string; icon: React.ReactNode; live: 'polite' | 'assertive' }
  > = {
    dirty: {
      label: 'Unsaved changes',
      className: 'text-muted-foreground',
      icon: <Loader2 className="h-4 w-4" />,
      live: 'polite',
    },
    saving: {
      label: 'Saving…',
      className: 'text-muted-foreground',
      icon: <Loader2 className="h-4 w-4 motion-safe:animate-spin" />,
      live: 'polite',
    },
    saved: {
      label: 'All changes saved',
      className: 'text-success',
      icon: <CheckCircle2 className="h-4 w-4" />,
      live: 'polite',
    },
    offline: {
      label: error ?? 'Offline — changes will sync when you reconnect',
      className: 'text-warning',
      icon: <CloudOff className="h-4 w-4" />,
      live: 'polite',
    },
    retrying: {
      label: error ?? 'Retrying…',
      className: 'text-warning',
      icon: <RefreshCw className="h-4 w-4 motion-safe:animate-spin" />,
      live: 'polite',
    },
    error: {
      label: error ?? 'Could not save changes',
      className: 'text-destructive',
      icon: <AlertTriangle className="h-4 w-4" />,
      live: 'assertive',
    },
    conflict: {
      label: error ?? 'Profile changed elsewhere',
      className: 'text-destructive',
      icon: <AlertTriangle className="h-4 w-4" />,
      live: 'assertive',
    },
  }

  const entry = config[status]
  return (
    <span
      role={status === 'error' || status === 'conflict' ? 'alert' : 'status'}
      aria-live={entry.live}
      className={`inline-flex items-center gap-2 text-xs font-medium ${entry.className}`}
    >
      <span className="flex-shrink-0" aria-hidden="true">{entry.icon}</span>
      {entry.label}
    </span>
  )
}

function getDisplayValue(value?: string | null, fallback = 'Not provided') {
  return value && value.trim().length > 0 ? value : fallback
}

export default function StudentSettings() {
  const navigate = useNavigate()
  const { brandName } = usePortalBrand()
  const { user } = useAuth()
  const { profile, updateProfile, isLoading: profileLoading } = useProfileQuery()
  const { metadata } = useProfileAutoPopulation()
  const toast = useToastStore()

  React.useEffect(() => { onSettingsMount(user?.id) }, [user?.id])

  const profileEditingEnabled = true

  const {
    register,
    setValue,
    reset,
    resetField,
    watch,
    getValues,
    trigger,
    setError,
    control,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema) as never,
    mode: 'onChange',
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

  // Keep refs current so stable autosave callbacks read the latest form state.
  const dirtyFieldsRef = React.useRef(dirtyFields)
  const errorsRef = React.useRef(errors)
  React.useEffect(() => { dirtyFieldsRef.current = dirtyFields }, [dirtyFields])
  React.useEffect(() => { errorsRef.current = errors }, [errors])

  const save = React.useCallback(
    async (delta: Record<string, unknown>): Promise<ProfileAutosaveResult> => {
      const updated = await updateProfile(delta as Partial<UserProfile>)
      return updated as ProfileAutosaveResult
    },
    [updateProfile],
  )

  const onSaved = React.useCallback(
    (result: ProfileAutosaveResult, delta: Record<string, unknown>) => {
      // Null-safe field-by-field merge so isDirty clears only for saved fields
      // (preserves the audit-production Settings fix; see profileAutosave.ts).
      const merged = buildProfileResetValues(
        getValues() as Record<string, string | undefined>,
        result as Record<string, string | null | undefined>,
      )
      for (const field of Object.keys(delta)) {
        resetField(field as keyof ProfileForm, {
          defaultValue: merged[field] as never,
        })
      }
    },
    [getValues, resetField],
  )

  const onError = React.useCallback((error: unknown) => {
    const err = error as Error & { fieldErrors?: Record<string, string> }
    if (err?.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
      Object.entries(err.fieldErrors).forEach(([field, message]) => {
        setError(field as keyof ProfileForm, { type: 'server', message })
      })
    }
  }, [setError])

  const {
    sections,
    scheduleSave,
    markDirty,
    saveNow,
    retry,
    registerServerVersion,
    resolveConflict,
    isOnline,
  } = useProfileSectionAutosave({
    save,
    onSaved,
    onError,
    enabled: profileEditingEnabled,
  })

  // Surface the profile version so a change made in another tab/device is
  // detected as a conflict rather than silently overwritten.
  React.useEffect(() => {
    registerServerVersion(typeof profile?.updated_at === 'string' ? profile.updated_at : undefined)
  }, [profile?.updated_at, registerServerVersion])

  const handleSectionEdit = React.useCallback(
    async (sectionId: ProfileSectionId) => {
      const fields = PROFILE_SECTIONS[sectionId]
      const valid = await trigger(fields as never)
      const values = getValues() as Record<string, unknown>
      const invalidFields = new Set(
        fields.filter((field) => Boolean((errorsRef.current as Record<string, unknown>)[field])),
      )
      const delta = extractSectionDelta(fields, values, dirtyFieldsRef.current, invalidFields)
      if (Object.keys(delta).length === 0) {
        if (!valid) markDirty(sectionId)
        return
      }
      scheduleSave(sectionId, delta)
    },
    [trigger, getValues, markDirty, scheduleSave],
  )

  // Watch user edits and route each change to its section's autosave.
  React.useEffect(() => {
    const subscription = watch((_values, { name, type }) => {
      if (!name || type !== 'change') return
      const sectionId = sectionForField(name)
      if (!sectionId) return
      void handleSectionEdit(sectionId)
    })
    return () => subscription.unsubscribe()
  }, [watch, handleSectionEdit])

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

  const handleNavigate = React.useCallback((path: string) => {
    // Autosave is canonical: flush any queued edits, then navigate. No blocking
    // confirm dialog — the autosave hook owns unload protection.
    saveNow()
    navigate(path)
  }, [saveNow, navigate])

  const conflictedSections = PROFILE_SECTION_IDS.filter((id) => sections[id].status === 'conflict')
  const hasConflict = conflictedSections.length > 0

  const handleReloadLatest = React.useCallback(() => {
    if (!profile) return
    // Discard local edits and re-hydrate from the authoritative server profile.
    reset(buildProfileResetValues(
      getValues() as Record<string, string | undefined>,
      profile as unknown as Record<string, string | null | undefined>,
    ) as ProfileForm)
    conflictedSections.forEach((id) => resolveConflict(id, 'reload'))
    registerServerVersion(typeof profile?.updated_at === 'string' ? profile.updated_at : undefined)
    toast.success('Reloaded', 'Showing the latest saved profile.')
  }, [profile, reset, getValues, conflictedSections, resolveConflict, registerServerVersion, toast])

  const handleKeepMine = React.useCallback(() => {
    conflictedSections.forEach((id) => resolveConflict(id, 'keep'))
  }, [conflictedSections, resolveConflict])

  return (
    <>
      <Seo
        title={brandedPageTitle('My Settings', brandName)}
        description="Manage your profile details, residence information, and security settings for your admissions account."
        path="/student/settings"
        siteName={brandName}
        noindex
      />
    <PageShell
      title="Profile and security settings"
      subtitle="Your profile changes save automatically as you edit. Review your account details, residence information, notification contact, and active sessions before you continue with applications and payments."
      eyebrow="Profile"
      tone="student"
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
          className="inline-flex min-h-touch items-center rounded-lg px-3 py-2 text-sm font-medium text-primary transition-colors hover:text-primary/80 hover:bg-primary/5"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to dashboard
        </button>

        {profileLoading ? (
          <div className="space-y-6" role="status" aria-label="Loading profile">
            <SectionCard title="Applicant profile" icon={<User className="h-5 w-5" />}>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div><Skeleton className="h-4 w-20 mb-2" /><Skeleton className="h-10 w-full rounded-md" /></div>
                <div><Skeleton className="h-4 w-24 mb-2" /><Skeleton className="h-10 w-full rounded-md" /></div>
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 mt-5">
                <div><Skeleton className="h-4 w-24 mb-2" /><Skeleton className="h-10 w-full rounded-md" /></div>
                <div><Skeleton className="h-4 w-20 mb-2" /><Skeleton className="h-10 w-full rounded-md" /></div>
                <div><Skeleton className="h-4 w-12 mb-2" /><Skeleton className="h-10 w-full rounded-md" /></div>
              </div>
            </SectionCard>
            <SectionCard title="Residence and identity" icon={<MapPin className="h-5 w-5" />}>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <div><Skeleton className="h-4 w-28 mb-2" /><Skeleton className="h-10 w-full rounded-md" /></div>
                <div><Skeleton className="h-4 w-20 mb-2" /><Skeleton className="h-10 w-full rounded-md" /></div>
                <div><Skeleton className="h-4 w-20 mb-2" /><Skeleton className="h-10 w-full rounded-md" /></div>
              </div>
            </SectionCard>
            <SectionCard title="Emergency contact" icon={<Users className="h-5 w-5" />}>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div><Skeleton className="h-4 w-28 mb-2" /><Skeleton className="h-10 w-full rounded-md" /></div>
                <div><Skeleton className="h-4 w-28 mb-2" /><Skeleton className="h-10 w-full rounded-md" /></div>
              </div>
            </SectionCard>
            <span className="sr-only">Loading profile settings</span>
          </div>
        ) : (

        <form className="space-y-6" onSubmit={(event) => event.preventDefault()}>
          {hasConflict && (
            <div
              role="alert"
              aria-live="assertive"
              className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                Your profile was updated in another session. Reload the latest version or keep the changes you just made.
              </span>
              <span className="flex flex-shrink-0 gap-2">
                <Button type="button" size="sm" variant="outline" className="min-h-touch" onClick={handleReloadLatest}>
                  Reload latest
                </Button>
                <Button type="button" size="sm" variant="destructive" className="min-h-touch" onClick={handleKeepMine}>
                  Keep my changes
                </Button>
              </span>
            </div>
          )}

          {!isOnline && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning"
            >
              <CloudOff className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              You are offline. Your edits are kept on this device and will save automatically when you reconnect.
            </div>
          )}

          <SectionCard
            title={SECTION_LABELS.applicant}
            description="These are the core account details that appear throughout the student portal."
            icon={<User className="h-5 w-5" />}
            actions={<SaveIndicator status={sections.applicant.status} error={sections.applicant.error} />}
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
                inputMode="tel"
                label="Phone number"
                autoComplete="tel"
                placeholder="+260970000000"
                helperText="Zambian format (+260 and 9 digits). Reused for SMS notification delivery."
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
            title={SECTION_LABELS.residence}
            description="These details feed the application wizard so your residence data does not drift from your student profile."
            icon={<MapPin className="h-5 w-5" />}
            actions={<SaveIndicator status={sections.residence.status} error={sections.residence.error} />}
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
            title={SECTION_LABELS.emergency}
            description="Provide a trusted contact in case the admissions team cannot reach you directly."
            icon={<Users className="h-5 w-5" />}
            actions={<SaveIndicator status={sections.emergency.status} error={sections.emergency.error} />}
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
                inputMode="tel"
                label="Next of kin phone"
                autoComplete="tel"
                placeholder="+260970000000"
                error={errors.next_of_kin_phone?.message}
                disabled={!profileEditingEnabled}
              />
            </div>
          </SectionCard>

          <SectionCard
            title="Notification delivery"
            description="Portal inbox notifications stay available in-app. SMS delivery uses the phone number stored on this profile."
            icon={<Bell className="h-5 w-5" />}
            actions={
              <Button type="button" variant="outline" size="sm" className="min-h-touch" onClick={() => handleNavigate('/student/notifications')}>
                Open notification preferences
              </Button>
            }
          >
            <p className="text-sm text-muted-foreground">
              SMS delivery phone: <span className="font-semibold text-foreground">{getDisplayValue(notificationPhone, 'No phone number on file')}</span>
            </p>
          </SectionCard>

          <SectionCard
            title="Security and active sessions"
            description="Review every device currently signed in to your account and revoke any session you do not recognize."
            icon={<Shield className="h-5 w-5" />}
          >
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              Terminating another session signs that device out without affecting the current page. Use this after shared-device access or if you notice an unfamiliar browser or IP address.
            </div>
            <ActiveSessions />
          </SectionCard>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
            {PROFILE_SECTION_IDS.some((id) => sections[id].status === 'error') && (
              <Button
                type="button"
                variant="outline"
                className="w-full md:mr-auto md:w-auto"
                onClick={() => PROFILE_SECTION_IDS.forEach((id) => sections[id].status === 'error' && retry(id))}
              >
                <RefreshCw className="h-4 w-4" />
                Retry saving
              </Button>
            )}
            <Button type="button" variant="secondary" className="w-full md:w-auto" onClick={() => handleNavigate('/student/dashboard')}>
              Done
            </Button>
          </div>
        </form>
        )}
      </div>
    </PageShell>
    </>
  )
}
