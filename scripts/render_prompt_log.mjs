#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const resolvePath = (inputPath) =>
  path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath)

const defaultInput = path.resolve(__dirname, '../onlytactics_prompt_log.md')
const inputPath = resolvePath(process.argv[2] ?? defaultInput)
const outputArg = process.argv[3]
const defaultOutput = path.resolve(__dirname, '../public/onlytactics_prompt_log.html')
const outputPath = outputArg !== undefined ? resolvePath(outputArg) : defaultOutput

const htmlEscape = (value) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const SECTION_PATTERN =
  /---\s*\n\*\*(User|Cursor)\*\*\s*\n([\s\S]*?)(?=(?:\n---\s*\n\*\*(?:User|Cursor)\*\*\s*\n)|\Z)/g

const buildHtml = (preamble, interactions) => {
  const renderedPreamble = preamble
    ? `<section class="preamble">
  <h2>Specification</h2>
  <pre>${htmlEscape(preamble.trim())}</pre>
</section>`
    : ''

  const renderedInteractions = interactions
    .map((entry, idx) => {
      const userBlock = entry.user
        ? `<div class="user-block">
    <div class="entry-label">User #${idx + 1}</div>
    <pre>${htmlEscape(entry.user.trim())}</pre>
  </div>`
        : ''

      const agentBlock = entry.agent
        ? `<details class="agent-block">
    <summary>Agent response #${idx + 1}</summary>
    <pre>${htmlEscape(entry.agent.trim())}</pre>
  </details>`
        : ''

      return `<section class="interaction">
  ${userBlock}
  ${agentBlock}
</section>`
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Only Tactics Prompt Log</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        background: #05070f;
        color: #ebf3ff;
      }

      body {
        margin: 0;
        padding: 2rem;
        line-height: 1.5;
      }

      main {
        max-width: 960px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }

      h1 {
        margin: 0 0 0.5rem;
        font-size: 2rem;
      }

      h2 {
        margin: 0 0 0.5rem;
      }

      pre {
        background: #0e1424;
        padding: 1rem;
        border-radius: 0.5rem;
        overflow-x: auto;
        margin: 0;
        font-size: 0.9rem;
        white-space: pre-wrap;
      }

      .interaction {
        border: 1px solid #1a233a;
        border-radius: 0.75rem;
        padding: 1rem;
        background: #080d18;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .entry-label {
        font-size: 0.85rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #7ea2ff;
        margin-bottom: 0.4rem;
      }

      details.agent-block {
        border: 1px solid #28304d;
        border-radius: 0.5rem;
        padding: 0.5rem 0.75rem;
        background: #0c1324;
      }

      details.agent-block summary {
        cursor: pointer;
        font-weight: 600;
        color: #9fb7ff;
        outline: none;
      }

      details.agent-block pre {
        margin-top: 0.75rem;
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>Only Tactics Prompt Log</h1>
        <p>Click any agent response to expand the full output. User prompts remain in-line.</p>
      </header>
      ${renderedPreamble}
      ${renderedInteractions}
    </main>
  </body>
</html>`
}

const run = async () => {
  const raw = await readFile(inputPath, 'utf-8')
  const matches = Array.from(raw.matchAll(SECTION_PATTERN))

  if (!matches.length) {
    throw new Error('No conversation sections found in prompt log')
  }

  const preamble = raw.slice(0, matches[0].index).trim()
  const entries = matches.map((match) => ({
    role: match[1],
    body: match[2].trim(),
  }))

  const interactions = []
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]
    if (entry.role === 'User') {
      const agent = entries[i + 1]?.role === 'Cursor' ? entries[i + 1] : undefined
      interactions.push({
        user: entry.body,
        agent: agent?.body ?? '',
      })
      if (agent) {
        i += 1
      }
    } else {
      interactions.push({
        user: '',
        agent: entry.body,
      })
    }
  }

  const html = buildHtml(preamble, interactions)
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, html, 'utf-8')
  console.info(`Prompt log written to ${outputPath}`)
}

run().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

