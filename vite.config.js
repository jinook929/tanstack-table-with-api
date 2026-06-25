import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // The Tailwind v4 plugin scans your files and generates utility classes on the fly.
  plugins: [react(), tailwindcss()],
})
