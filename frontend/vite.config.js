import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import fs from 'fs'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    {
      name: 'copy-index-to-404',
      writeBundle() {
        fs.copyFileSync(
          path.resolve(__dirname, 'dist/index.html'), 
          path.resolve(__dirname, 'dist/404.html')
        );
      }
    }
  ],
  base: '/donation-app/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
})
