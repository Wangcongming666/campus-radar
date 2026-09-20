import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import EmptyState from './EmptyState.vue'

describe('EmptyState', () => {
  it('announces its message and emits the offered recovery action', async () => {
    const wrapper = mount(EmptyState, {
      props: { title: '暂无收藏', description: '收藏职位后会显示在这里', actionLabel: '去找职位' },
    })

    expect(wrapper.get('[role="status"]').text()).toContain('暂无收藏')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('action')).toHaveLength(1)
  })
})
