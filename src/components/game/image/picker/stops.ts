// Step definitions for the picker's Detail and Timer sliders, plus their label helpers — shared
// by the controls (DetailControl / TimerControl) and the accordion summaries in ImagePicker.

export interface Stop { value: number, label: string }

// Detail tiers map named steps to cell-density values, so the GM picks a look, not a number.
// `DEFAULT_SCALE` (8) is Standard.
export const DETAIL_STOPS: Stop[] = [
  { value: 4, label: 'Chunky' },
  { value: 6, label: 'Simple' },
  { value: 8, label: 'Standard' },
  { value: 12, label: 'Detailed' },
  { value: 18, label: 'Fine' },
]

// The last timer stop is a sentinel that unlocks a free-text seconds input.
export const CUSTOM_SECS = -1
export const DURATION_STOPS: Stop[] = [
  { value: 30, label: '30s' },
  { value: 60, label: '1m' },
  { value: 120, label: '2m' },
  { value: 180, label: '3m' },
  { value: 300, label: '5m' },
  { value: CUSTOM_SECS, label: 'custom' },
]

export function detailLabel(scale: number): string {
  return DETAIL_STOPS.find(s => s.value === scale)?.label ?? 'Custom'
}
export function durationLabel(value: number): string {
  return DURATION_STOPS.find(s => s.value === value)?.label ?? 'custom'
}
