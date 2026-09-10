import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const { version } = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string }

// `src/styles/` is organised into role folders (foundation / mixins / base / components /
// screens); these load paths let partials keep resolving each other by bare name
// (`@use 'tokens'`) regardless of which folder they sit in.
const stylesRoot = fileURLToPath(new URL('./src/styles', import.meta.url))
const styleLoadPaths = ['foundation', 'mixins', 'base', 'components', 'screens']
  .map(dir => `${stylesRoot}/${dir}`)

export default defineConfig({
  base: '/pixmaler/',
  plugins: [
    vue(),
    {
      // Stamps the client version into index.html at build time (#25), so it is in
      // the shipped markup rather than written by the app at runtime.
      name: 'pixmaler-client-version',
      transformIndexHtml: (html: string) => html.replaceAll('%PIXMALER_CLIENT_VERSION%', version),
    },
  ],
  server: {
    port: 7965, // PXML
  },
  css: {
    preprocessorOptions: {
      scss: { loadPaths: styleLoadPaths },
    },
  },
})
