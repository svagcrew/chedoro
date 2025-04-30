import react from '@vitejs/plugin-react'
import { defineConfig, PluginOption } from 'vite'
import { createHtmlPlugin } from 'vite-plugin-html'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const base = mode === 'production' ? '/chedoro/' : '/'
  return {
    plugins: [
      react(),
      createHtmlPlugin({
        inject: {
          data: {
            base,
          },
        },
      }) as PluginOption,
    ],
    base,
    server: {
      host: true,
    },
  }
})
