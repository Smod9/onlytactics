import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env from parent directory
config({ path: resolve(__dirname, '../../.env') })
import { createUser } from '../src/auth/userService'
import { getPool } from '../src/db'

const createAdmin = async () => {
  const email = process.argv[2]
  const displayName = process.argv[3]
  const password = process.argv[4]

  if (!email || !displayName || !password) {
    console.error('Usage: tsx scripts/createAdmin.ts <email> <displayName> <password>')
    process.exit(1)
  }

  try {
    const user = await createUser(email, password, displayName, 'admin')
    console.log('Admin user created successfully!')
    console.log('  ID:', user.id)
    console.log('  Email:', user.email)
    console.log('  Display Name:', user.displayName)
    console.log('  Role:', user.role)
  } catch (error) {
    console.error('Failed to create admin:', error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    const pool = getPool()
    await pool.end()
  }
}

createAdmin()
