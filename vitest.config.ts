import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// Two projects under one `pnpm test`: the existing DOM-free suites in Node, and a small
// browser-mode smoke that drives the real canvas in headless Chromium (what Node can't reach).
const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) }
// The style partials resolve each other by bare name, so the browser project needs the same
// load paths `vite.config.ts` gives the app.
const stylesRoot = fileURLToPath(new URL('./src/styles', import.meta.url))
const styleLoadPaths = ['foundation', 'mixins', 'base', 'components', 'screens']
  .map(dir => `${stylesRoot}/${dir}`)

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
        plugins: [vue()],
        resolve: { alias },
        css: { preprocessorOptions: { scss: { loadPaths: styleLoadPaths } } },
        test: {
          name: 'browser',
          include: ['test/browser/**/*.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
          },
        },
      },
    ],
  },
})
