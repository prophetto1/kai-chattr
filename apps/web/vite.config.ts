import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

// apps/web may proxy only to kai-chattr services/api, never to legacy chattr.
const apiTarget = (process.env.KAI_CHATTR_API_URL ?? 'http://127.0.0.1:8840').replace(/\/$/, '')
const wsTarget = apiTarget.replace(/^http/, 'ws')

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 8800,
    strictPort: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '^/observability/(status|endpoints)': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/openapi.json': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/docs': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/redoc': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/uploads': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/ws': {
        target: wsTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 8800,
    strictPort: true,
  },
})
