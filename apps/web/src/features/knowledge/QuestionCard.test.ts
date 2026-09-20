import type { Question } from '@career-launch/shared'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import QuestionCard from './QuestionCard.vue'

const question: Question = { id: 'q-1', prompt: '如何介绍项目经历？', referenceApproach: '使用 STAR 框架。', category: '通用能力', stage: 'HR 面', difficulty: '基础', tags: ['表达'], favorite: false }

describe('QuestionCard', () => {
  it('reveals the reference approach only after the student asks for it', async () => {
    const wrapper = mount(QuestionCard, { props: { question } })
    expect(wrapper.text()).not.toContain('使用 STAR 框架。')
    await wrapper.get('button').trigger('click')
    expect(wrapper.text()).toContain('使用 STAR 框架。')
  })
})
