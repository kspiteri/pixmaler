import antfu from '@antfu/eslint-config'

export default antfu({
  vue: true,
  typescript: true,
  formatters: {
    css: true,
    html: true,
  },
  ignores: [
    'dist',
    '.partykit',
  ],
}, {
  rules: {
    // Allow tightly-grouped variable initialisations on one line
    // (common in algorithmic code: Bresenham bounds, median-cut min/max, etc.).
    'style/max-statements-per-line': ['error', { max: 6 }],

    // alert() and confirm() both have an in-UI replacement (lib/dialog.ts), so
    // the rule stands with no exemptions.
    'no-alert': 'error',
  },
})
