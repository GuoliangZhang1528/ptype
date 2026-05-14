import { describe, expect, it } from 'vitest'
import {
  createCustomTextSchema,
  deleteCustomTextSchema,
  updateCustomTextSchema,
} from './validation'

describe('custom text validation', () => {
  it('trims and accepts valid custom text payloads', () => {
    const result = createCustomTextSchema.safeParse({
      title: '  Practice  ',
      content: '  hello world  ',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.title).toBe('Practice')
      expect(result.data.content).toBe('hello world')
    }
  })

  it('rejects empty or oversized custom text payloads', () => {
    expect(
      createCustomTextSchema.safeParse({ title: '', content: 'text' }).success
    ).toBe(false)
    expect(
      createCustomTextSchema.safeParse({ title: 'title', content: '' }).success
    ).toBe(false)
    expect(
      createCustomTextSchema.safeParse({
        title: 'x'.repeat(81),
        content: 'text',
      }).success
    ).toBe(false)
    expect(
      createCustomTextSchema.safeParse({
        title: 'title',
        content: 'x'.repeat(10001),
      }).success
    ).toBe(false)
  })

  it('requires bounded ids for update and delete operations', () => {
    expect(
      updateCustomTextSchema.safeParse({
        id: 'custom-id',
        title: 'title',
        content: 'text',
      }).success
    ).toBe(true)
    expect(deleteCustomTextSchema.safeParse({ id: '' }).success).toBe(false)
    expect(
      deleteCustomTextSchema.safeParse({ id: 'x'.repeat(129) }).success
    ).toBe(false)
  })
})
