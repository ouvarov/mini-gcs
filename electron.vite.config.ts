import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared },
  },
  renderer: {
    resolve: { alias: { ...shared, '@renderer': resolve('src/renderer/src') } },
    plugins: [react()],
  },
})
