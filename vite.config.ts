import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const { version } = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string }

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
})
