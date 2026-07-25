import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  base: '/Field-Ledger/',
  server: {
    proxy: {
      '/checkmyninbvn-api': {
        target: 'https://checkmyninbvn.com.ng/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/checkmyninbvn-api/, '')
      },
      '/fasterverify-api': {
        target: 'https://fasterverify.com.ng/api/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/fasterverify-api/, '')
      }
    }
  }
})