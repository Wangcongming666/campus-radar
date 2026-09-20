import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import PermissionGate from './PermissionGate.vue'

describe('PermissionGate', () => {
  it('hides super administrator actions from content operators', () => {
    const wrapper = mount(PermissionGate, { props: { allow: ['super_admin'], currentRole: 'content_operator' }, slots: { default: '<button>创建运营账号</button>' } })
    expect(wrapper.find('button').exists()).toBe(false)
  })
})
