import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves project sites from /<repo>/; the deploy workflow sets BASE_PATH
  base: process.env.BASE_PATH ?? '/',
  // polling avoids stale modules when several files are rewritten at once (seen on Windows)
  server: { watch: { usePolling: true, interval: 300 } },
})
