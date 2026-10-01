import type { Application } from '@career-launch/shared'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ApplicationsBoard from './ApplicationsBoard.vue'

const applications: Application[] = [
  {
    id: 'a1', userId: 'user-1', jobId: 'job-1', jobTitle: '后端开发', companyName: '星海科技', companyLogoText: '星',
    city: ['上海'], deadlineAt: '2026-11-01T15:59:59.000Z', stage: 'applied', note: '', archived: false,
    events: [{ id: 'event-1', toStage: 'applied', occurredAt: '2026-09-20T10:00:00.000Z' }],
    reminders: [], updatedAt: '2026-09-20T10:00:00.000Z',
  },
]

describe('ApplicationsBoard', () => {
  it('never nests interactive buttons inside a card button', () => {
    const wrapper = mount(ApplicationsBoard, { props: { applications } })

    expect(wrapper.findAll('button button')).toHaveLength(0)
    expect(wrapper.findAll('.application-card button.archive-link').length).toBeGreaterThan(0)
  })

  it('emits open-application when the card body is clicked', async () => {
    const wrapper = mount(ApplicationsBoard, { props: { applications } })

    await wrapper.get('.card-main').trigger('click')
    expect(wrapper.emitted('open-application')).toEqual([[{ id: 'a1' }]])
  })
})
