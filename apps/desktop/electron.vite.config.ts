import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// @maquest/core ships TS sources, so bundle it instead of externalizing.
const build = { externalizeDeps: { exclude: ['@maquest/core'] } }

export default defineConfig({
  main: { build },
  preload: { build },
  renderer: {
    resolve: { alias: { '@': resolve(__dirname, 'src/renderer/src') } },
    plugins: [react(), tailwindcss()],
  },
})
