import { fileURLToPath } from 'node:url'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// Two projects under one `pnpm test`: the existing DOM-free suites in Node, and a small
// browser-mode smoke that drives the real canvas in headless Chromium (what Node can't reach).
const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) }

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['test/**/*.test.ts'],
          exclude: ['test/browser/**'],
          environment: 'node',
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'browser',
          include: ['test/browser/**/*.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
