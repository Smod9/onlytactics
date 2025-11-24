#!/usr/bin/env node

import { copyFile, mkdir, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distDir = path.resolve(__dirname, '../dist')
const indexPath = path.join(distDir, 'index.html')
const fallbackTargets = [path.join(distDir, '200.html'), path.join(distDir, 'app/index.html')]

const ensureIndexExists = async () => {
  try {
    await access(indexPath)
  } catch {
    throw new Error('dist/index.html not found. Run `vite build` before prepare_spa_routes.')
  }
}

const copyTo = async (target) => {
  await mkdir(path.dirname(target), { recursive: true })
  await copyFile(indexPath, target)
}

const run = async () => {
  await ensureIndexExists()
  await Promise.all(fallbackTargets.map(copyTo))
  console.info('SPA fallbacks written to 200.html and /app/index.html')
}

run().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

