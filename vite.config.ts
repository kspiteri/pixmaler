import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/pixmaler/',
  plugins: [vue()],
  server: {
    port: 7965, // PXML
  },
})
