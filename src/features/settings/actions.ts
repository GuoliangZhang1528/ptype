'use server'

import { prisma } from '@/lib/prisma'
import { getUserId } from '@/lib/auth'
import type { Prisma } from '@prisma/client'

type UserSettings = Prisma.JsonObject & {
  customDuration?: number
}

export async function saveCustomDuration(duration: number) {
  try {
    const userId = await getUserId()
    if (!userId) return { success: false, error: 'Unauthorized' }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    })

    const currentSettings = (user?.settings as UserSettings | null) || {}

    await prisma.user.update({
      where: { id: userId },
      data: {
        settings: {
          ...currentSettings,
          customDuration: duration,
        },
      },
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to save custom duration:', error)
    return { success: false, error: 'Failed' }
  }
}

export async function getUserSettings() {
  try {
    const userId = await getUserId()
    if (!userId) return { success: false, error: 'Unauthorized' }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    })

    return { success: true, settings: user?.settings }
  } catch {
    return { success: false, error: 'Failed' }
  }
}
