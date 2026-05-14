import { jwtVerify } from 'jose'
import { cookies } from 'next/headers'

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production')
  }
  return new TextEncoder().encode(secret || 'default-secret-key')
}

export async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')

  if (!token) {
    return null
  }

  try {
    const { payload } = await jwtVerify(token.value, getJwtSecret())
    return payload.sub as string
  } catch {
    return null
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const userId = await getUserId()
  return !!userId
}
