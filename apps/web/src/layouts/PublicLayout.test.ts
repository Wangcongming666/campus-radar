import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'

import PublicLayout from './PublicLayout.vue'

const { sessionState } = vi.hoisted(() => ({
  sessionState: {
    user: null as { nickname: string } | null,
    loginVisible: false,
    requestLogin: vi.fn(),
    hydrate: vi.fn(),
    logout: vi.fn(async () => {}),
  },
}))

vi.mock('../stores/session', () => ({ useSessionStore: () => sessionState }))

vi.mock('../features/auth/LoginDialog.vue', () => ({ default: { name: 'LoginDialog', render: () => null } }))

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
})

async function mountLayout() {
  await router.push('/')
  await router.isReady()
  return mount(PublicLayout, { global: { plugins: [router], stubs: { RouterView: true } } })
}

describe('PublicLayout dual-mode header', () => {
  it('gives visitors a login entry and no dead menu toggle', async () => {
    sessionState.user = null
    const wrapper = await mountLayout()

    expect(wrapper.find('.menu-toggle').exists()).toBe(false)
    expect(wrapper.find('.account-button').exists()).toBe(true)
  })

  it('offers a sign-out path inside the navigation for signed-in users', async () => {
    sessionState.user = { nickname: '林同学' }
    const wrapper = await mountLayout()

    const logoutButton = wrapper.find('.nav-logout')
    expect(logoutButton.exists()).toBe(true)

    await logoutButton.trigger('click')
    const confirmButton = wrapper.find('.nav-logout-confirm .nav-logout-final')
    expect(confirmButton.exists()).toBe(true)

    await confirmButton.trigger('click')
    expect(sessionState.logout).toHaveBeenCalled()
  })
})
