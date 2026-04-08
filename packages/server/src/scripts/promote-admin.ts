#!/usr/bin/env tsx
// Promote a user to admin by user ID (works with CloudBase backend)
// Usage: npx tsx src/scripts/promote-admin.ts <userId>

import 'dotenv/config'
import { getDb } from '../db'

async function promoteAdmin(userId: string) {
  const db = getDb()

  const user = await db.users.findById(userId)
  if (!user) {
    console.error(`User with id "${userId}" not found`)
    process.exit(1)
  }

  console.log(`Found user: ${user.username} (id: ${user.id}, role: ${user.role})`)

  if (user.role === 'admin') {
    console.log('User is already an admin')
    process.exit(0)
  }

  await db.users.updateRole(userId, 'admin')
  console.log(`✅ User "${user.username}" has been promoted to admin`)
  process.exit(0)
}

const [userId] = process.argv.slice(2)
if (!userId) {
  console.error('Usage: DB_PROVIDER=cloudbase npx tsx src/scripts/promote-admin.ts <userId>')
  process.exit(1)
}

promoteAdmin(userId)
