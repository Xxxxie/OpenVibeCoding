#!/usr/bin/env tsx
import { getDb } from '../db'

async function setAdmin(username: string) {
  const db = getDb()

  // Find user by username - need to search through all users
  // Since findByProviderAndExternalId needs provider, try 'local' and 'github'
  let user = await db.users.findByProviderAndExternalId('local', username)

  if (!user) {
    user = await db.users.findByProviderAndExternalId('github', username)
  }

  // If still not found, try searching by username across all users
  if (!user) {
    const allUsers = await db.users.findAll(100, 0)
    user = allUsers.find((u) => u.username === username) || null
  }

  if (!user) {
    console.error(`User "${username}" not found`)
    process.exit(1)
  }

  if (user.role === 'admin') {
    console.log(`User "${user.username}" is already an admin`)
    process.exit(0)
  }

  await db.users.updateRole(user.id, 'admin')
  console.log(`✅ User "${user.username}" (id: ${user.id}) has been promoted to admin`)
  process.exit(0)
}

const [username] = process.argv.slice(2)
if (!username) {
  console.error('Usage: tsx set-admin.ts <username>')
  process.exit(1)
}

setAdmin(username)
