import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import HomeGate from './HomeGate.vue'

const { sessionState } = vi.hoisted(() => ({
  sessionState: { user: null as { nickname: string } | null, requestLogin: vi.fn() },
}))

vi.mock('../../stores/session', () => ({ useSessionStore: () => sessionState }))

vi.mock('../../services/repository', () => ({
  repository: {
    jobs: { list: async () => ({ items: [], page: 1, pageSize: 6, total: 0 }) },
    companies: { list: async () => ({ items: [], page: 1, pageSize: 6, total: 0 }) },
  },
}))

describe('HomeGate', () => {
  it('shows the marketing landing page for visitors', () => {
    sessionState.user = null
    const wrapper = mount(HomeGate)

    expect(wrapper.text()).toContain('面向高校应届生的一站式求职平台')
    expect(wrapper.text()).toContain('联系我们')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('shows the application home for signed-in users', () => {
    sessionState.user = { nickname: '林同学' }
    const wrapper = mount(HomeGate)

    expect(wrapper.text()).toContain('把复杂的校招')
    expect(wrapper.text()).not.toContain('联系我们')
  })
})
