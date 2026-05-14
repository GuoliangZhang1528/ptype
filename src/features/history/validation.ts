import { z } from 'zod'

export const saveResultSchema = z.object({
  cpm: z.number().int().min(0).max(2000),
  accuracy: z.number().min(0).max(100),
  mode: z.enum(['english', 'chinese', 'coder', 'custom']),
  subMode: z.string().max(40).nullable(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  duration: z.number().int().min(1).max(9999),
})

export type ValidSaveResultInput = z.infer<typeof saveResultSchema>
