import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  // Tailwind 는 배틀 데모(src/demo)만 쓴다. 유틸리티만 넣고 preflight 는 넣지 않는다 (src/demo/demo.css)
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@pokebattle': path.resolve(__dirname, '../src'),
    },
  },
})
