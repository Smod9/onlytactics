import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version?: string }
const fallbackVersion = packageJson.version ?? '0.0.0'

const changelogUrlBase = 'https://github.com/Smod9/onlytactics/blob/main/CHANGELOG.md'
let releaseNotesUrl = `https://github.com/Smod9/onlytactics/releases/tag/v${encodeURIComponent(fallbackVersion)}`
let displayVersion = fallbackVersion

try {
  const changelog = readFileSync(new URL('./CHANGELOG.md', import.meta.url), 'utf-8')
  // Match semantic-release format: # [1.10.0](link) (date)
  const headingMatch = changelog.match(/^#\s+\[([\w.+-]+)\]\([^)]+\)\s+\(([^)]+)\)/m)
  if (headingMatch) {
    const [, version, date] = headingMatch
    displayVersion = version
    const headingText = `${version} ${date}`.trim().toLowerCase()
    const anchor = headingText
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
    releaseNotesUrl = `${changelogUrlBase}#${anchor}`
  }
} catch {
  // fall back to the release tag URL if changelog parsing fails
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:2567',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json'],
  },
  define: {
    __APP_VERSION__: JSON.stringify(displayVersion),
    __APP_RELEASE_URL__: JSON.stringify(releaseNotesUrl),
  },
  test: {
    globals: true,
    environment: 'node',
    exclude: ['**/node_modules/**', '**/e2e/**', '**/dist/**'],
  },
})
