import type { Resume } from '@career-launch/shared'
import { describe, expect, it } from 'vitest'

import { validateResume } from './validation'

const resume: Resume = { id: 'r-1', userId: 'u-1', name: '求职简历', template: 'classic', accentColor: '#315cf5', profile: { name: '', email: '', phone: '', city: '', targetRole: '' }, education: [], internships: [], projects: [], skills: [], honors: [], summary: '', updatedAt: '2026-09-20T00:00:00Z', version: 1 }

describe('resume validation', () => {
  it('requires identity, valid contact information, and education', () => {
    const result = validateResume(resume)
    expect(result.valid).toBe(false)
    expect(result.errors.map((item) => item.path)).toEqual(expect.arrayContaining(['profile.name', 'profile.email', 'profile.phone', 'education']))
  })
})
