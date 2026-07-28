import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Tunak Lead Consulting',
        short_name: 'Tunak Lead Consulting',
        description: 'Field operations management for agents',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'tunak-logo.jpg',
            sizes: '192x192',
            type: 'image/jpeg'
          },
          {
            src: 'tunak-logo.jpg',
            sizes: '512x512',
            type: 'image/jpeg'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 // 5 MiB
      }
    })
  ],
  base: '/Field-Ledger/',
  server: {
    // Local proxies removed in favor of Supabase Edge Function 'api-proxy'
  }
})