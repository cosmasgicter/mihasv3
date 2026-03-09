/**
 * Nationality dropdown options for profile and application forms.
 * "Zambian" is the default/first option, followed by others alphabetically.
 * Requirement 32.4
 */

const OTHER_NATIONALITIES = [
  'Afghan', 'Albanian', 'Algerian', 'American', 'Angolan', 'Argentine', 'Australian',
  'Bangladeshi', 'Belgian', 'Botswanan', 'Brazilian', 'British', 'Burundian',
  'Cameroonian', 'Canadian', 'Chadian', 'Chinese', 'Colombian', 'Congolese',
  'Cuban', 'Dutch', 'Egyptian', 'Ethiopian', 'Filipino', 'Finnish', 'French',
  'German', 'Ghanaian', 'Greek', 'Indian', 'Indonesian', 'Iranian', 'Iraqi',
  'Irish', 'Israeli', 'Italian', 'Ivorian', 'Japanese', 'Kenyan',
  'Lebanese', 'Liberian', 'Libyan', 'Malawian', 'Malaysian', 'Malian',
  'Mexican', 'Moroccan', 'Mozambican', 'Namibian', 'Nigerian', 'Norwegian',
  'Pakistani', 'Polish', 'Portuguese', 'Romanian', 'Rwandan', 'Saudi',
  'Senegalese', 'Sierra Leonean', 'Somali', 'South African', 'South Korean',
  'Spanish', 'Sudanese', 'Swazi', 'Swedish', 'Swiss', 'Tanzanian', 'Thai',
  'Togolese', 'Tunisian', 'Turkish', 'Ugandan', 'Ukrainian',
  'Venezuelan', 'Vietnamese', 'Zimbabwean',
  'Other',
] as const

export const NATIONALITY_OPTIONS = [
  { value: 'Zambian', label: 'Zambian' },
  ...OTHER_NATIONALITIES.map(n => ({ value: n, label: n })),
]

export const DEFAULT_NATIONALITY = 'Zambian'
