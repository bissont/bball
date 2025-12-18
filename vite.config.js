import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // For GitHub Pages: if repo is "bball", use "/bball/", otherwise use "/"
  // Change this to match your GitHub repository name
  base: process.env.NODE_ENV === 'production' ? '/bball/' : '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
})
