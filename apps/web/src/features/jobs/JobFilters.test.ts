import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import JobFilters from './JobFilters.vue'

describe('JobFilters', () => {
  it('emits a reset query with pagination returned to the first page', async () => {
    const wrapper = mount(JobFilters, {
      props: { modelValue: { keyword: 'Java', city: ['上海'], category: ['技术'], education: ['本科'], sort: 'deadline', page: 3, pageSize: 12 } },
    })

    await wrapper.get('button[data-action="reset"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual({ city: [], category: [], education: [], sort: 'latest', page: 1, pageSize: 12 })
  })
})
