import { describe, expect, it } from 'vitest'

import { canTransition } from './stages'

describe('application stage transitions', () => {
  it.each([
    ['pending_confirmation', 'applied', true],
    ['applied', 'written_test', true],
    ['written_test', 'interview', true],
    ['offer', 'written_test', false],
    ['rejected', 'interview', false],
  ] as const)('%s to %s returns %s', (from, to, expected) => {
    expect(canTransition(from, to)).toBe(expected)
  })
})
