import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Allow network access
    https: process.env.HTTPS === 'true', // Enable HTTPS when HTTPS=true
  },
  build: {
    rollupOptions: {
      output: {
        // More aggressive cache busting with build timestamp
        entryFileNames: (chunkInfo) => {
          const buildId = Date.now()
          return `assets/[name]-${buildId}.[hash].js`
        },
        chunkFileNames: (chunkInfo) => {
          const buildId = Date.now()
          return `assets/[name]-${buildId}.[hash].js`
        },
        assetFileNames: (assetInfo) => {
          const buildId = Date.now()
          return `assets/[name]-${buildId}.[hash].[ext]`
        }
      }
    },
    // Generate manifest for better cache invalidation
    manifest: true,
    // Ensure clean build each time
    emptyOutDir: true
  }
})
