import type { User } from '@career-launch/shared'

export function authRedirect(user: User | null, to: { path: string }): string | null {
  if (user) return null
  if (to.path === '/') return null
  return '/'
}
