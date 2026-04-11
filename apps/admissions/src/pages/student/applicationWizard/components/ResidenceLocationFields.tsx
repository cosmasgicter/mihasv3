import { useDeferredValue, useMemo, useState } from 'react'

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
          className="min-h-[36px] rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onMouseDown={event => event.preventDefault()}
          onClick={() => onSelect(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
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
  const [focusedField, setFocusedField] = useState<SuggestionField | null>(null)
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

  const countryHelper = loadingCountries ? 'Loading countries...' : 'Type to search countries.'
  const townHelper = loadingCities
    ? 'Loading town suggestions...'
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
                error={(errors as any).country?.message}
                helperText={countryHelper}
                extraDescribedBy={getFieldAriaDescribedBy?.('country')}
                onFocus={event => {
                  setFocusedField('country')
                  event.currentTarget.select()
                }}
                onBlur={event => {
                  field.onChange(normalizeResidenceCountry(event.target.value))
                  field.onBlur()
                  setFocusedField(null)
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
                    setFocusedField(null)
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
                label={`${RESIDENCE_TOWN_LABEL} *`}
                autoComplete="address-level2"
                placeholder="Start typing your town"
                required
                error={errors.residence_town?.message}
                helperText={townHelper}
                extraDescribedBy={getFieldAriaDescribedBy?.('residence_town')}
                onFocus={() => {
                  setFocusedField('residence_town')
                }}
                onBlur={event => {
                  field.onChange(normalizeResidenceTown(event.target.value))
                  field.onBlur()
                  setFocusedField(null)
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
                    setFocusedField(null)
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
