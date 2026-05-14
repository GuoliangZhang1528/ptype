import { z } from 'zod'

export const customTextPayloadSchema = z.object({
  title: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(10000),
})

export const createCustomTextSchema = customTextPayloadSchema

export const updateCustomTextSchema = customTextPayloadSchema.extend({
  id: z.string().min(1).max(128),
})

export const deleteCustomTextSchema = z.object({
  id: z.string().min(1).max(128),
})
