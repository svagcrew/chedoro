import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  return {
    plugins: [react()],
    base: mode === 'production' ? '/chedoro/' : '/',
    server: {
      host: true,
    },
  }
})
