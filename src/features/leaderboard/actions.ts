'use server'

import { prisma } from '@/lib/prisma'
import { TypingMode } from '@/lib/constants'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

export interface LeaderboardEntry {
  id: string
  rank: number
  username: string
  cpm: number
  accuracy: number
  date: string
  avatar?: string | null
}

export interface GetLeaderboardParams {
  mode?: TypingMode
  difficulty?: string
  subMode?: string | null
}

const leaderboardParamsSchema = z.object({
  mode: z.enum(['english', 'chinese', 'coder']).default('english'),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  subMode: z.string().max(40).nullable().optional(),
})

export async function getLeaderboard(
  params: GetLeaderboardParams
): Promise<{ success: boolean; data?: LeaderboardEntry[]; error?: string }> {
  try {
    const validation = leaderboardParamsSchema.safeParse(params)
    if (!validation.success) {
      return { success: false, error: 'Invalid leaderboard filters' }
    }

    const { mode, difficulty, subMode } = validation.data
    const subModeFilter = subMode
      ? Prisma.sql`AND tr."subMode" = ${subMode}`
      : Prisma.empty

    const leaderboard = await prisma.$queryRaw<
      {
        id: string
        username: string | null
        cpm: number
        accuracy: number
        date: Date
        avatar: string | null
      }[]
    >(Prisma.sql`
      SELECT ranked.id,
             ranked.username,
             ranked.cpm,
             ranked.accuracy,
             ranked.date,
             ranked.avatar
      FROM (
        SELECT DISTINCT ON (tr."userId")
               tr.id,
               u.username,
               tr."wpm" AS cpm,
               tr.accuracy,
               tr."createdAt" AS date,
               u."avatarUrl" AS avatar
        FROM "TypingResult" tr
        LEFT JOIN "User" u ON u.id = tr."userId"
        WHERE tr.mode = ${mode}
          AND tr.difficulty = ${difficulty}
          ${subModeFilter}
        ORDER BY tr."userId", tr."wpm" DESC, tr.accuracy DESC, tr."createdAt" ASC
      ) ranked
      ORDER BY ranked.cpm DESC, ranked.accuracy DESC, ranked.date ASC
      LIMIT 50
    `)

    // Transform data to match frontend expectation
    const formattedLeaderboard: LeaderboardEntry[] = leaderboard.map(
      (entry, index) => {
        return {
          id: entry.id,
          rank: index + 1,
          username: entry.username || 'Unknown',
          cpm: entry.cpm,
          accuracy: entry.accuracy,
          date: entry.date.toISOString(),
          avatar: entry.avatar,
        }
      }
    )

    return { success: true, data: formattedLeaderboard }
  } catch (error) {
    console.error('Error fetching leaderboard:', error)
    return { success: false, error: 'Failed to fetch leaderboard' }
  }
}
