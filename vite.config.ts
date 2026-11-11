import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// base を相対パスにしておくと、GitHub Pages などサブディレクトリ配下でもそのまま動きます。
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
