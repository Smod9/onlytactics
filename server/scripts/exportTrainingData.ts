import { config } from 'dotenv'
import { resolve } from 'path'
import fs from 'fs'

config({ path: resolve(__dirname, '../../.env') })

import { getPool } from '../src/db'
import { extractTrainingRow, FEATURE_NAMES } from '../../src/ai/features'
import type { ReplayRecording } from '../../src/types/race'

const OUTPUT_DIR = resolve(__dirname, '../../training/data')

async function main() {
  const pool = getPool()

  console.log('[export] Querying approved races...')
  const result = await pool.query(
    'SELECT race_id, replay_data FROM races WHERE training_approved = true ORDER BY finished_at DESC',
  )

  if (result.rows.length === 0) {
    console.log('[export] No approved races found. Approve some races in the admin dashboard first.')
    process.exit(0)
  }

  console.log(`[export] Found ${result.rows.length} approved races`)

  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  const header = [...FEATURE_NAMES, 'target_twa_sin', 'target_twa_cos'].join(',')
  const allRows: string[] = [header]
  let totalFrames = 0
  let totalRows = 0

  for (const dbRow of result.rows) {
    const recording = dbRow.replay_data as ReplayRecording
    const raceId = dbRow.race_id as string

    if (!recording?.frames?.length) {
      console.log(`[export] Skipping race ${raceId}: no frames`)
      continue
    }

    let raceRows = 0
    for (const frame of recording.frames) {
      if (frame.state.t < 0) continue
      totalFrames++

      for (const boat of Object.values(frame.state.boats)) {
        if (boat.ai) continue
        if (boat.finished) continue
        if (boat.speed < 0.1) continue

        const row = extractTrainingRow(frame.state, boat)
        const values = FEATURE_NAMES.map((k) => row.features[k].toFixed(6))
        values.push(row.targetTwaSin.toFixed(6), row.targetTwaCos.toFixed(6))
        allRows.push(values.join(','))
        raceRows++
        totalRows++
      }
    }

    console.log(`[export] Race ${raceId}: ${recording.frames.length} frames -> ${raceRows} training rows`)
  }

  const outPath = resolve(OUTPUT_DIR, 'training_data.csv')
  fs.writeFileSync(outPath, allRows.join('\n') + '\n')

  console.log(`[export] Done. ${totalFrames} frames -> ${totalRows} training rows`)
  console.log(`[export] Output: ${outPath}`)

  await pool.end()
}

main().catch((err) => {
  console.error('[export] Fatal error:', err)
  process.exit(1)
})
