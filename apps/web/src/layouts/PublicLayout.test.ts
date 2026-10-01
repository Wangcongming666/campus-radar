import { flushPromises, mount } from '@vue/test-utils'
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

async function mountAt(path: string) {
  await router.push(path)
  await router.isReady()
  const wrapper = mount(PublicLayout, { global: { plugins: [router], stubs: { RouterView: true } } })
  return wrapper
}

describe('PublicLayout dual-mode header', () => {
  it('gives visitors a login entry and no dead menu toggle', async () => {
    sessionState.user = null
    const wrapper = await mountAt('/')

    expect(wrapper.find('.menu-toggle').exists()).toBe(false)
    expect(wrapper.find('.account-button').exists()).toBe(true)
  })

  it('hides the application navigation on the marketing page', async () => {
    sessionState.user = { nickname: '林同学' }
    const wrapper = await mountAt('/')

    expect(wrapper.find('#site-nav').exists()).toBe(false)
    expect(wrapper.find('.menu-toggle').exists()).toBe(false)
    expect(wrapper.find('.avatar-button').text()).toBe('林')
  })

  it('keeps the application navigation inside the app', async () => {
    sessionState.user = { nickname: '林同学' }
    const wrapper = await mountAt('/jobs')

    expect(wrapper.find('#site-nav').exists()).toBe(true)
    expect(wrapper.find('.avatar-button').exists()).toBe(true)
  })

  it('shows only the avatar initial, never the full nickname', async () => {
    sessionState.user = { nickname: '林同学' }
    const wrapper = await mountAt('/jobs')

    expect(wrapper.find('.avatar-button').text()).toBe('林')
    expect(wrapper.text()).not.toContain('林同学')
  })

  it('confirms sign-out inside the avatar menu before logging out', async () => {
    sessionState.user = { nickname: '林同学' }
    sessionState.logout.mockClear()
    const wrapper = await mountAt('/jobs')

    expect(wrapper.find('.account-menu').exists()).toBe(false)

    await wrapper.get('.avatar-button').trigger('click')
    const menu = wrapper.get('.account-menu')
    expect(menu.text()).toContain('个人中心')
    expect(menu.text()).toContain('退出登录')

    await menu.get('.menu-logout').trigger('click')
    await flushPromises()
    expect(sessionState.logout).not.toHaveBeenCalled()

    expect(wrapper.get('.logout-confirm-card').text()).toContain('数据保留')
    await wrapper.get('.logout-confirm-card .confirm-logout').trigger('click')
    await flushPromises()
    expect(sessionState.logout).toHaveBeenCalled()
  })
})
