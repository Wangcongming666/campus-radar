import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SkeletonCard from './SkeletonCard.vue'

describe('SkeletonCard', () => {
  it('announces loading state and renders the requested line count', () => {
    const wrapper = mount(SkeletonCard, { props: { lines: 4, label: '正在加载投递记录' } })

    expect(wrapper.get('[role="status"]').attributes('aria-label')).toBe('正在加载投递记录')
    expect(wrapper.findAll('.bar')).toHaveLength(5)
  })

  it('renders three lines by default', () => {
    const wrapper = mount(SkeletonCard)
    expect(wrapper.findAll('.bar')).toHaveLength(4)
  })
})
