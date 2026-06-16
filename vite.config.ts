import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: resolve(__dirname, 'platforms/pwa'),
  build: {
    outDir: resolve(__dirname, 'platforms/pwa/dist'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@modules': resolve(__dirname, 'modules'),
    },
  },
  server: {
    fs: {
      allow: [resolve(__dirname, 'modules')],
    },
  },
})
