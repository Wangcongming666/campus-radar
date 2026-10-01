import type { Application } from '@career-launch/shared'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ApplicationDrawer from './ApplicationDrawer.vue'

function application(id: string, note: string): Application {
  return {
    id, userId: 'user-1', jobId: `job-${id}`, jobTitle: '后端开发', companyName: '星海科技', companyLogoText: '星',
    city: ['上海'], deadlineAt: '2026-11-01T15:59:59.000Z', stage: 'applied', note, archived: false,
    events: [{ id: `event-${id}`, toStage: 'applied', occurredAt: '2026-09-20T10:00:00.000Z' }],
    reminders: [], updatedAt: '2026-09-20T10:00:00.000Z',
  }
}

describe('ApplicationDrawer', () => {
  it('keeps the unsaved note draft when the application reloads with the same id', async () => {
    const wrapper = mount(ApplicationDrawer, { props: { application: application('a1', '旧备注') } })

    const textarea = wrapper.get('textarea')
    await (textarea.element as HTMLTextAreaElement).focus()
    await wrapper.get('textarea').setValue('刚输入的新备注')

    await wrapper.setProps({ application: structuredClone(application('a1', '旧备注')) })
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('刚输入的新备注')
  })

  it('resets the draft when switching to a different application', async () => {
    const wrapper = mount(ApplicationDrawer, { props: { application: application('a1', '旧备注') } })

    await wrapper.get('textarea').setValue('刚输入的新备注')
    await wrapper.setProps({ application: application('a2', '另一条的备注') })
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('另一条的备注')
  })
})
