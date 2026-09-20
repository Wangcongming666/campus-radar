import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import HeroSearch from './HeroSearch.vue'

describe('HeroSearch', () => {
  it('emits a trimmed keyword when the student submits a search', async () => {
    const wrapper = mount(HeroSearch)

    await wrapper.get('input[aria-label="搜索公司、岗位或城市"]').setValue('  Java 后端  ')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('search')).toEqual([['Java 后端']])
  })
})
