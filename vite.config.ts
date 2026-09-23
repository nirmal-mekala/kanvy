import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      // `pnpm dev:server` (json-server) rewrites this file on every
      // network-mode write — without this, Vite's dev server treats that
      // as a source change and does a full reload, restarting the app (and
      // whatever in-memory network-mode settings/state it held) on every
      // edit made while testing against the local backend.
      ignored: ['**/server/db.json'],
    },
  },
})
