import { describe, expect, it } from 'vitest'

import { validateEmail, validateVerificationCode } from './validation'

describe('login validation', () => {
  it.each(['', 'student', 'student@', '@example.com'])('rejects invalid email %s', (email) => {
    expect(validateEmail(email)).toBe('请输入有效邮箱')
  })

  it('accepts a normal university email', () => {
    expect(validateEmail('student@university.edu.cn')).toBeNull()
  })

  it('requires a six digit verification code', () => {
    expect(validateVerificationCode('123')).toBe('请输入 6 位验证码')
    expect(validateVerificationCode('246810')).toBeNull()
  })
})
