import http from 'node:http'
import https from 'node:https'
import { env } from '../src/lib/env'

const baseUrl =
  process.env.COLYSEUS_BASE_URL ??
  `http://${env.hostname === '0.0.0.0' ? '127.0.0.1' : env.hostname}:${env.port}`

const target = new URL('/health', baseUrl)
const client = target.protocol === 'https:' ? https : http

const run = () =>
  new Promise<void>((resolve, reject) => {
    const request = client.get(target, (response) => {
      let raw = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        raw += chunk
      })
      response.on('end', () => {
        try {
          const payload = JSON.parse(raw)
          console.info('[smoke] Health response:', payload)
          if (payload.status === 'ok') {
            console.info('[smoke] ✅ Server responded successfully')
            resolve()
          } else {
            reject(new Error(`Unexpected payload: ${raw}`))
          }
        } catch (error) {
          reject(error)
        }
      })
    })
    request.on('error', (error) => reject(error))
    request.setTimeout(5_000, () => {
      request.destroy(new Error('Timed out waiting for response'))
    })
  })

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[smoke] ❌ Server health check failed:', error)
    process.exit(1)
  })
