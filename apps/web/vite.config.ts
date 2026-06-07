import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/',
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
    outDir: '../../services/api/static/workbench',
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 8800,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:8300',
      '/uploads': 'http://127.0.0.1:8300',
      '/ws': {
        target: 'ws://127.0.0.1:8300',
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
