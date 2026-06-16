import antfu from '@antfu/eslint-config'

export default antfu({
  vue: true,
  typescript: true,
  formatters: {
    css: true,
    html: true,
  },
  ignores: [
    'src/lib/vendor/**',
    'dist',
    '.partykit',
  ],
}, {
  rules: {
    // Allow tightly-grouped variable initialisations on one line
    // (common in algorithmic code: Bresenham bounds, median-cut min/max, etc.).
    'style/max-statements-per-line': ['error', { max: 6 }],

    // alert/confirm are placeholders pending the error-banner UI in the
    // polishing plan (docs/.plans/04-polishing-and-fixes.md).
    'no-alert': 'off',
  },
})
