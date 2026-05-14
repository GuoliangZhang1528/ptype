'use server'

import { prisma } from '@/lib/prisma'
import { getUserId } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import {
  verifyAdvancedSignature,
  type AdvancedSignaturePayload,
} from '@/lib/security/verifier'
import {
  createCustomTextSchema,
  deleteCustomTextSchema,
  updateCustomTextSchema,
} from './validation'

export interface CustomText {
  id: string
  title: string
  content: string
  createdAt: Date
  updatedAt: Date
}

export async function getCustomTexts(): Promise<{
  success: boolean
  data?: CustomText[]
  error?: string
}> {
  try {
    const userId = await getUserId()
    if (!userId) return { success: false, error: 'Unauthorized' }

    const texts = await prisma.customText.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        content: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    })

    return { success: true, data: texts }
  } catch (error) {
    console.error('Failed to get custom texts:', error)
    return { success: false, error: 'Failed to fetch custom texts' }
  }
}

interface CreateCustomTextInput {
  title: string
  content: string
}

export async function createCustomText(
  input: CreateCustomTextInput,
  signature?: AdvancedSignaturePayload
): Promise<{ success: boolean; data?: CustomText; error?: string }> {
  try {
    // 签名验证
    const verification = await verifyAdvancedSignature(signature || null, input)
    if (!verification.valid) {
      return { success: false, error: 'Invalid request signature' }
    }

    const userId = await getUserId()
    if (!userId) return { success: false, error: 'Unauthorized' }

    const validation = createCustomTextSchema.safeParse(input)
    if (!validation.success) {
      return { success: false, error: 'Invalid custom text' }
    }

    const text = await prisma.customText.create({
      data: {
        userId,
        title: validation.data.title,
        content: validation.data.content,
      },
    })

    revalidatePath('/settings')
    return { success: true, data: text }
  } catch (error) {
    console.error('Failed to create custom text:', error)
    return { success: false, error: 'Failed to create custom text' }
  }
}

interface UpdateCustomTextInput {
  id: string
  title: string
  content: string
}

export async function updateCustomText(
  input: UpdateCustomTextInput,
  signature?: AdvancedSignaturePayload
): Promise<{ success: boolean; data?: CustomText; error?: string }> {
  try {
    // 签名验证
    const verification = await verifyAdvancedSignature(signature || null, input)
    if (!verification.valid) {
      return { success: false, error: 'Invalid request signature' }
    }

    const userId = await getUserId()
    if (!userId) return { success: false, error: 'Unauthorized' }

    const validation = updateCustomTextSchema.safeParse(input)
    if (!validation.success) {
      return { success: false, error: 'Invalid custom text' }
    }

    const text = await prisma.customText.update({
      where: { id: validation.data.id, userId },
      data: {
        title: validation.data.title,
        content: validation.data.content,
      },
    })

    revalidatePath('/settings')
    return { success: true, data: text }
  } catch (error) {
    console.error('Failed to update custom text:', error)
    return { success: false, error: 'Failed to update custom text' }
  }
}

interface DeleteCustomTextInput {
  id: string
}

export async function deleteCustomText(
  input: DeleteCustomTextInput,
  signature?: AdvancedSignaturePayload
): Promise<{ success: boolean; error?: string }> {
  try {
    // 签名验证
    const verification = await verifyAdvancedSignature(signature || null, input)
    if (!verification.valid) {
      return { success: false, error: 'Invalid request signature' }
    }

    const userId = await getUserId()
    if (!userId) return { success: false, error: 'Unauthorized' }

    const validation = deleteCustomTextSchema.safeParse(input)
    if (!validation.success) {
      return { success: false, error: 'Invalid custom text id' }
    }

    await prisma.customText.delete({
      where: { id: validation.data.id, userId },
    })

    revalidatePath('/settings')
    return { success: true }
  } catch (error) {
    console.error('Failed to delete custom text:', error)
    return { success: false, error: 'Failed to delete custom text' }
  }
}
