import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'

import LandingPage from './LandingPage.vue'

const { sessionState } = vi.hoisted(() => ({
  sessionState: { user: null as { nickname: string } | null, requestLogin: vi.fn() },
}))

vi.mock('../../stores/session', () => ({ useSessionStore: () => sessionState }))

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
})

async function mountPage() {
  await router.push('/')
  await router.isReady()
  return mount(LandingPage, { global: { plugins: [router] } })
}

describe('LandingPage call to action', () => {
  it('asks visitors to sign in', async () => {
    sessionState.user = null
    const wrapper = await mountPage()

    expect(wrapper.get('.cta').text()).toBe('登录 / 注册')
    await wrapper.get('.cta').trigger('click')
    expect(sessionState.requestLogin).toHaveBeenCalled()
  })

  it('points signed-in visitors into the workspace', async () => {
    sessionState.user = { nickname: '林同学' }
    const wrapper = await mountPage()

    expect(wrapper.get('.cta').text()).toBe('进入求职工作台')
    await wrapper.get('.cta').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/me/workspace')
  })
})
