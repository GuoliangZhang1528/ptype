import { describe, expect, it } from 'vitest'
import { saveResultSchema } from './validation'

const validResult = {
  cpm: 420,
  accuracy: 98.5,
  mode: 'english',
  subMode: null,
  difficulty: 'medium',
  duration: 60,
}

describe('saveResultSchema', () => {
  it('accepts a valid typing result', () => {
    expect(saveResultSchema.safeParse(validResult).success).toBe(true)
  })

  it('rejects unrealistic or malformed numeric metrics', () => {
    expect(
      saveResultSchema.safeParse({ ...validResult, cpm: 2001 }).success
    ).toBe(false)
    expect(
      saveResultSchema.safeParse({ ...validResult, cpm: 12.5 }).success
    ).toBe(false)
    expect(
      saveResultSchema.safeParse({ ...validResult, accuracy: 101 }).success
    ).toBe(false)
    expect(
      saveResultSchema.safeParse({ ...validResult, duration: 0 }).success
    ).toBe(false)
  })

  it('rejects unsupported categorization fields', () => {
    expect(
      saveResultSchema.safeParse({ ...validResult, mode: 'battle' }).success
    ).toBe(false)
    expect(
      saveResultSchema.safeParse({ ...validResult, difficulty: 'expert' })
        .success
    ).toBe(false)
    expect(
      saveResultSchema.safeParse({
        ...validResult,
        subMode: 'x'.repeat(41),
      }).success
    ).toBe(false)
  })
})
