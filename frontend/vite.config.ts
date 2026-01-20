import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BACKEND_TARGET = process.env.BACKEND_URL ?? 'http://localhost:54321'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // proxy any /api requests during development to the backend
      '/api': {
        target: BACKEND_TARGET,
        changeOrigin: true,
        secure: false,
      }
    }
  }
})

