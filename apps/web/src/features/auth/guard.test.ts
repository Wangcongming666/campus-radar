import type { User } from '@career-launch/shared'
import { describe, expect, it } from 'vitest'

import { authRedirect } from './guard'

const user: User = {
  id: 'user-1', email: 'student@example.com', nickname: '林同学', graduationYear: 2027,
  school: '启程大学', education: '本科', major: '计算机科学与技术', targetRoles: ['后端开发'],
  status: 'active', role: 'student',
}

describe('authRedirect', () => {
  it.each([
    [null, '/', null],
    [null, '/jobs', '/'],
    [null, '/me/workspace', '/'],
    [user, '/jobs', null],
    [user, '/me/workspace', null],
  ] as const)('user=%j visiting %s → %s', (currentUser, path, expected) => {
    expect(authRedirect(currentUser, { path })).toBe(expected)
  })
})
