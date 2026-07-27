import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/ventasplu/',
  build: { outDir: 'docs' },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'VURA BI — La Trattoria',
        short_name: 'VURA BI',
        description: 'Ventas por PLU y Business Intelligence de La Trattoria',
        start_url: '/ventasplu/',
        scope: '/ventasplu/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#7a6020',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // BI vive de datos frescos de Bubble/Supabase — no cachear
        // llamadas a Edge Functions, solo el shell de la app (JS/CSS/HTML)
        // para que abra rápido y funcione como app instalada.
        navigateFallbackDenylist: [/^\/functions\//],
      },
    }),
  ],
})
