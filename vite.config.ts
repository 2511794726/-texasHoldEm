import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  base: process.env.VITE_BASE_PATH || './',
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,webp,svg,ico}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: null,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/')
          if (
            normalized.includes('/node_modules/vue/') ||
            normalized.includes('/node_modules/@vue/') ||
            normalized.includes('/node_modules/pinia/') ||
            normalized.includes('/node_modules/pinia-plugin-persistedstate/')
          ) {
            return 'vendor-vue'
          }
          if (normalized.includes('/node_modules/gsap/')) {
            return 'vendor-gsap'
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    open: false,
  },
})
