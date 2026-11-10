import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'

import { Controller, useWatch, type UseFormReturn } from 'react-hook-form'

import { AnimatedInput } from '@/components/smoothui/animated-input'
import { useResidenceLocationOptions } from '@/hooks/useResidenceLocationOptions'
import { DEFAULT_RESIDENCE_COUNTRY, normalizeResidenceCountry, type LocationOption } from '@/lib/locationOptions'
import { normalizeResidenceTown, RESIDENCE_TOWN_LABEL } from '@/lib/residenceTown'

import type { WizardFormData } from '../types'

interface ResidenceLocationFieldsProps {
  form: UseFormReturn<WizardFormData>
  getFieldAriaDescribedBy?: (fieldName: string) => string | undefined
}

type SuggestionField = 'country' | 'residence_town'

const MAX_VISIBLE_SUGGESTIONS = 8

function filterOptions(options: LocationOption[], query: string): LocationOption[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return options.slice(0, MAX_VISIBLE_SUGGESTIONS)

  const startsWith: LocationOption[] = []
  const contains: LocationOption[] = []

  for (const option of options) {
    const key = option.label.toLowerCase()
    if (key.startsWith(normalizedQuery)) {
      startsWith.push(option)
    } else if (key.includes(normalizedQuery)) {
      contains.push(option)
    }
  }

  return [...startsWith, ...contains].slice(0, MAX_VISIBLE_SUGGESTIONS)
}

function SuggestionButtons({
  id,
  label,
  options,
  onSelect,
}: {
  id: string
  label: string
  options: LocationOption[]
  onSelect: (value: string) => void
}) {
  if (options.length === 0) return null

  return (
    <div id={id} className="mt-2 flex flex-wrap gap-2" aria-label={label}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          /* 44 px, not 36 (admissions-v2 task 11.5, R16.2) — a suggestion chip is
             a touch target on the student's phone like any other control. */
          className="min-h-touch rounded-full border border-border bg-card px-3 py-1 text-base sm:text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onMouseDown={event => event.preventDefault()}
          onClick={() => onSelect(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Which field's suggestion row is open — and a rule about when it closes.
 *
 * The row opens on focus and closes on blur. A blur caused by a POINTER press
 * elsewhere (Continue, Save now, the next field) now closes it after that press
 * is RELEASED and its click delivered, not on the press itself (admissions-v2
 * task 6.3 completion pass).
 * Closing it on the press collapsed a row of 44 px suggestion chips while the
 * pointer was still down, so everything below the field moved up by that height
 * between `pointerdown` and `pointerup`; the browser then delivered the click to
 * whatever had moved under the pointer. On the personal step that was the
 * footer, not "Continue to Education" — the step silently refused to advance
 * (the browser run measured the button move from y=676 to y=624 mid-press).
 *
 * A keyboard blur (Tab), or a blur with no press in progress, still closes the
 * row at once.
 */
function useSuggestionFieldFocus() {
  const [focusedField, setFocusedField] = useState<SuggestionField | null>(null)
  const pointerPressRef = useRef(false)
  const closeOnReleaseRef = useRef(false)

  useEffect(() => {
    let closeTimer: ReturnType<typeof setTimeout> | null = null
    const onPointerDown = () => {
      pointerPressRef.current = true
    }
    const onPointerEnd = () => {
      pointerPressRef.current = false
      if (!closeOnReleaseRef.current) return
      // Close on the next task: the browser dispatches this press's `click` in
      // the same task as the release, so a layout change made after it can no
      // longer move the click's target.
      if (closeTimer !== null) clearTimeout(closeTimer)
      closeTimer = setTimeout(() => {
        closeTimer = null
        if (!closeOnReleaseRef.current) return
        closeOnReleaseRef.current = false
        setFocusedField(null)
      }, 0)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('pointerup', onPointerEnd, true)
    document.addEventListener('pointercancel', onPointerEnd, true)
    return () => {
      if (closeTimer !== null) clearTimeout(closeTimer)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('pointerup', onPointerEnd, true)
      document.removeEventListener('pointercancel', onPointerEnd, true)
    }
  }, [])

  const openSuggestions = useCallback((field: SuggestionField) => {
    closeOnReleaseRef.current = false
    setFocusedField(field)
  }, [])

  /** The field lost focus: close now, or when the press that blurred it ends. */
  const closeSuggestionsAfterBlur = useCallback(() => {
    if (pointerPressRef.current) {
      closeOnReleaseRef.current = true
      return
    }
    setFocusedField(null)
  }, [])

  /** A suggestion was chosen: close at once. */
  const closeSuggestions = useCallback(() => {
    closeOnReleaseRef.current = false
    setFocusedField(null)
  }, [])

  return { focusedField, openSuggestions, closeSuggestionsAfterBlur, closeSuggestions }
}

export function ResidenceLocationFields({
  form,
  getFieldAriaDescribedBy,
}: ResidenceLocationFieldsProps) {
  const {
    control,
    formState: { errors },
    clearErrors,
  } = form
  const { focusedField, openSuggestions, closeSuggestionsAfterBlur, closeSuggestions } =
    useSuggestionFieldFocus()
  const countryValue = useWatch({ control, name: 'country' }) ?? DEFAULT_RESIDENCE_COUNTRY
  const townValue = useWatch({ control, name: 'residence_town' }) || ''
  const deferredCountryQuery = useDeferredValue(countryValue)
  const deferredTownQuery = useDeferredValue(townValue)
  const { countryOptions, cityOptions, loadingCountries, loadingCities } = useResidenceLocationOptions(countryValue)

  const countrySuggestions = useMemo(
    () => filterOptions(countryOptions, deferredCountryQuery),
    [countryOptions, deferredCountryQuery]
  )
  const townSuggestions = useMemo(
    () => filterOptions(cityOptions, deferredTownQuery),
    [cityOptions, deferredTownQuery]
  )

  const countryHelper = loadingCountries ? 'Loading countries…' : 'Type to search countries.'
  const townHelper = loadingCities
    ? 'Loading town suggestions…'
    : townSuggestions.length > 0
      ? 'Type or choose a town.'
      : 'Type your town.'

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
      <div>
        <Controller
          name="country"
          control={control}
          render={({ field }) => (
            <>
              <AnimatedInput
                {...field}
                value={field.value ?? DEFAULT_RESIDENCE_COUNTRY}
                label="Country of Residence"
                autoComplete="country-name"
                error={errors.country?.message}
                helperText={countryHelper}
                extraDescribedBy={getFieldAriaDescribedBy?.('country')}
                onFocus={event => {
                  openSuggestions('country')
                  event.currentTarget.select()
                }}
                onBlur={event => {
                  field.onChange(normalizeResidenceCountry(event.target.value))
                  field.onBlur()
                  closeSuggestionsAfterBlur()
                }}
                onChange={event => {
                  field.onChange(event.target.value)
                  clearErrors('country')
                }}
              />
              {focusedField === 'country' && (
                <SuggestionButtons
                  id="residence-country-suggestions"
                  label="Country suggestions"
                  options={countrySuggestions}
                  onSelect={value => {
                    field.onChange(value)
                    clearErrors('country')
                    closeSuggestions()
                  }}
                />
              )}
            </>
          )}
        />
      </div>

      <div>
        <Controller
          name="residence_town"
          control={control}
          render={({ field }) => (
            <>
              <AnimatedInput
                {...field}
                value={field.value || ''}
                label={RESIDENCE_TOWN_LABEL}
                autoComplete="address-level2"
                placeholder="Start typing your town"
                required
                error={errors.residence_town?.message}
                helperText={townHelper}
                extraDescribedBy={getFieldAriaDescribedBy?.('residence_town')}
                onFocus={() => {
                  openSuggestions('residence_town')
                }}
                onBlur={event => {
                  field.onChange(normalizeResidenceTown(event.target.value))
                  field.onBlur()
                  closeSuggestionsAfterBlur()
                }}
                onChange={event => {
                  field.onChange(event.target.value)
                  clearErrors('residence_town')
                }}
              />
              {focusedField === 'residence_town' && (
                <SuggestionButtons
                  id="residence-town-suggestions"
                  label={`${RESIDENCE_TOWN_LABEL} suggestions`}
                  options={townSuggestions}
                  onSelect={value => {
                    field.onChange(normalizeResidenceTown(value))
                    clearErrors('residence_town')
                    closeSuggestions()
                  }}
                />
              )}
            </>
          )}
        />
      </div>
    </div>
  )
}

export default ResidenceLocationFields
