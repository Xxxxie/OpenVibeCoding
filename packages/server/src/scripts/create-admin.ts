#!/usr/bin/env tsx
import { getDb } from '../db'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'

async function createAdmin(username: string, password: string) {
  const db = getDb()
  const userId = nanoid()
  const now = Date.now()

  try {
    // Check if user already exists
    const existingUser = await db.users.findByProviderAndExternalId('local', username)
    if (existingUser) {
      console.error(`User "${username}" already exists`)
      process.exit(1)
    }

    // Create user with admin role
    await db.users.create({
      id: userId,
      provider: 'local',
      externalId: username,
      accessToken: '',
      username,
      email: null,
      name: username,
      role: 'admin', // Set as admin
      status: 'active',
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    })

    // Create local credentials
    await db.localCredentials.create({
      userId,
      passwordHash: await bcrypt.hash(password, 12),
      createdAt: now,
      updatedAt: now,
    })

    console.log(`✅ Admin user created successfully!`)
    console.log(`   Username: ${username}`)
    console.log(`   User ID: ${userId}`)
  } catch (error) {
    console.error('Failed to create admin user:', error)
    process.exit(1)
  }

  process.exit(0)
}

// CLI entry point
const [username, password] = process.argv.slice(2)

if (!username || !password) {
  console.error('Usage: tsx create-admin.ts <username> <password>')
  console.error('')
  console.error('Example:')
  console.error('  tsx create-admin.ts admin mypassword123')
  process.exit(1)
}

if (password.length < 6) {
  console.error('Password must be at least 6 characters')
  process.exit(1)
}

createAdmin(username, password)
