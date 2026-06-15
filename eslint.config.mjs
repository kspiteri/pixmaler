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
})
