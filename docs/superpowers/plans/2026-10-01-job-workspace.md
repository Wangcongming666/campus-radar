# 求职工作台（Job Workspace）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把投递看板升级为"主动求职助手"式工作台（今日聚焦/看板/列表/日历四视图 + 建议引擎 + 职位对比），并让提醒、归档、备注真正落地到数据层。

**Architecture:** 数据层先行——扩展 `CareerRepository.applications`（archive/setNote/reminders/syncDueReminders）并升级 localStorage 存储键；纯函数模型（建议引擎、统计、日历、对比）各自独立文件并表驱动测试；Vue 组件消费这些模型，子组件通过 `provide/inject('reloadApplications')` 与外壳解耦；最后迁移路由并组装。

**Tech Stack:** Vue 3 `<script setup>` + TypeScript、vue-router、vitest（web/ui 用 jsdom + @vue/test-utils，api-client/shared 纯逻辑）。不引入任何新依赖。

**Spec:** `docs/superpowers/specs/2026-10-01-job-workspace-design.md`

## Global Constraints

- 不新增任何 npm 依赖；图表用 CSS 手绘。
- 新建文件使用标准可读格式（2 空格缩进）；修改既有压缩风格文件时保持该文件原有风格。
- 所有用户可见文案为简体中文，遵守 spec §7 人性化措辞（"3 天后截止""已过期 2 天"，不裸奔日期）。
- 不可逆操作（放弃投递、归档、删除提醒）必须两步确认；确认文案说明后果。
- 所有动画在 `@media (prefers-reduced-motion: reduce)` 下禁用。
- Mock 仓储测试统一用 `createMockRepository({ storage: 'memory', latencyMs: 0 })`；涉及 localStorage 的用 jsdom。
- 现有测试（`pnpm -r --if-present test`）必须全部保持通过。
- 时间计算统一走 `@career-launch/shared` 的上海时区日界（`shanghaiDay`），禁止各处自造时区逻辑。

## Review Focus

1. **已过期的截止日期（负天数）**——合理预期：过期投递不出现在临期建议里，日历上显示为中性色而非警示色。测试：Task 2（`已过期 N 天`）、Task 3（`days < 0` 跳过 expiring_favorite）、Task 5（过期 deadline tone = `neutral`）。
2. **已归档投递泄漏**——合理预期：归档项不进建议/统计/日历。测试：Task 3、Task 4、Task 5 各有 `archived: true` 过滤断言。
3. **localStorage 旧数据损坏导致白屏**——合理预期：解析失败回退种子数据。测试：Task 1 写入非法 JSON 后 `jobs.list` 仍返回种子数据。
4. **到期提醒重复生成通知**——合理预期：`syncDueReminders` 幂等。测试：Task 1 连续调用两次，第二次返回 0 条。
5. **零投递/零收藏的空数据**——合理预期：建议引擎返回空数组而非崩溃，今日聚焦显示引导空状态。测试：Task 3、Task 4 空输入断言；Task 15 手动验收覆盖。

---

### Task 1: 数据层扩展（contracts + mock + favorite 查询 + 存储迁移）

**Files:**
- Modify: `packages/shared/src/domain.ts`（`JobQuery` 增加 `favorite?: boolean`）
- Modify: `packages/api-client/src/contracts.ts`（`applications` 增加四个成员）
- Modify: `packages/api-client/src/mock/repository.ts`（实现 + 存储键 v2 迁移）
- Modify: `packages/api-client/package.json`（test 脚本加 `--environment jsdom`）
- Test: `packages/api-client/src/mock/repository.test.ts`（追加用例）

**Interfaces:**
- Produces（后续任务依赖的确切签名）:
  - `applications.archive(id: string, value: boolean): Promise<void>`
  - `applications.setNote(id: string, note: string): Promise<Application>`
  - `applications.reminders.add(applicationId: string, remindAt: string, title: string): Promise<Reminder>`
  - `applications.reminders.remove(id: string): Promise<void>`
  - `applications.syncDueReminders(): Promise<Notification[]>`
  - `jobs.list({ favorite: true, ... })` 仅返回收藏职位

- [ ] **Step 1: Write the failing tests**

在 `packages/api-client/src/mock/repository.test.ts` 末尾（最后一个 `})` 之前）追加：

```ts
  it('archives, restores and edits the note of an application', async () => {
    const repository = createMockRepository({ storage: 'memory', latencyMs: 0 })
    const application = await repository.applications.start('job-001')

    await repository.applications.setNote(application.id, '笔试前复盘项目')
    await repository.applications.archive(application.id, true)
    expect((await repository.applications.list()).find((item) => item.id === application.id)?.archived).toBe(true)
    expect((await repository.applications.list()).find((item) => item.id === application.id)?.note).toBe('笔试前复盘项目')

    await repository.applications.archive(application.id, false)
    expect((await repository.applications.list()).find((item) => item.id === application.id)?.archived).toBe(false)
  })

  it('adds and removes reminders on an application', async () => {
    const repository = createMockRepository({ storage: 'memory', latencyMs: 0 })
    const application = await repository.applications.start('job-001')

    const reminder = await repository.applications.reminders.add(application.id, '2026-10-05T02:00:00.000Z', '准备笔试')
    expect((await repository.applications.list())[0].reminders).toHaveLength(1)

    await repository.applications.reminders.remove(reminder.id)
    expect((await repository.applications.list())[0].reminders).toHaveLength(0)
  })

  it('converts due reminders into notifications exactly once', async () => {
    const repository = createMockRepository({ storage: 'memory', latencyMs: 0 })
    const application = await repository.applications.start('job-001')
    await repository.applications.reminders.add(application.id, '2026-01-01T00:00:00.000Z', '跟进结果')

    const first = await repository.applications.syncDueReminders()
    const second = await repository.applications.syncDueReminders()

    expect(first).toHaveLength(1)
    expect(first[0].type).toBe('deadline')
    expect(first[0].href).toBe('/me/workspace')
    expect(second).toHaveLength(0)
  })

  it('lists only favorite jobs when the favorite filter is on', async () => {
    const repository = createMockRepository({ storage: 'memory', latencyMs: 0 })
    const page = await repository.jobs.list({ city: [], category: [], education: [], sort: 'latest', page: 1, pageSize: 100, favorite: true })

    expect(page.total).toBeGreaterThan(0)
    expect(page.items.every((job) => job.favorite)).toBe(true)
  })

  it('falls back to seed data when the persisted payload is corrupt', async () => {
    localStorage.setItem('career-launch-mock-v2', '{not json')
    const repository = createMockRepository({ storage: 'indexeddb', latencyMs: 0 })

    const page = await repository.jobs.list({ city: [], category: [], education: [], sort: 'latest', page: 1, pageSize: 5 })
    expect(page.total).toBeGreaterThan(0)
  })

  it('reads the legacy v1 storage key and migrates it on save', async () => {
    localStorage.removeItem('career-launch-mock-v2')
    const legacy = createMockRepository({ storage: 'indexeddb', latencyMs: 0 })
    const seeded = await legacy.jobs.list({ city: [], category: [], education: [], sort: 'latest', page: 1, pageSize: 5 })
    const payload = localStorage.getItem('career-launch-mock-v1')
    localStorage.removeItem('career-launch-mock-v2')
    if (payload) localStorage.setItem('career-launch-mock-v1', payload)

    const migrated = createMockRepository({ storage: 'indexeddb', latencyMs: 0 })
    const after = await migrated.jobs.list({ city: [], category: [], education: [], sort: 'latest', page: 1, pageSize: 5 })
    expect(after.total).toBe(seeded.total)
  })
```

同时在文件顶部 `describe` 之前加入：

```ts
beforeEach(() => {
  localStorage.clear()
})
```

并把 import 行改为：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
```

再把 `packages/api-client/package.json` 的 test 脚本改为 `"test": "vitest run --environment jsdom"`（node 环境没有 localStorage）。

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @career-launch/api-client test`
Expected: FAIL —— TypeScript 报 `archive`/`setNote`/`reminders`/`syncDueReminders`/`favorite` 不存在于类型上（先跑 typecheck 看到编译错误也算失败证据：`pnpm --filter @career-launch/api-client typecheck`）。

- [ ] **Step 3: Write the implementation**

`packages/shared/src/domain.ts`：`JobQuery` 接口内、`sort` 之前加一行：

```ts
  favorite?: boolean
```

`packages/api-client/src/contracts.ts`：import 块加 `Notification`、`Reminder`（按字母序插入）；`CareerRepository.applications` 改为：

```ts
  applications: {
    list(): Promise<Application[]>
    start(jobId: string): Promise<Application>
    updateStage(id: string, stage: ApplicationStage, note?: string): Promise<Application>
    archive(id: string, value: boolean): Promise<void>
    setNote(id: string, note: string): Promise<Application>
    reminders: {
      add(applicationId: string, remindAt: string, title: string): Promise<Reminder>
      remove(id: string): Promise<void>
    }
    syncDueReminders(): Promise<Notification[]>
  }
```

`packages/api-client/src/mock/repository.ts`：

(a) import 块补 `Notification, Reminder`（字母序）。

(b) `createStateStore` 整体替换为（v2 键 + 旧键迁移 + 损坏回退）：

```ts
const STORAGE_KEY = 'career-launch-mock-v2'
const LEGACY_KEY = 'career-launch-mock-v1'

function createStateStore(storage: MockRepositoryOptions['storage'], includeDemoApplications: boolean) {
  let memory = initialState(includeDemoApplications)

  if (storage === 'indexeddb' && typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY)
    if (saved) {
      try {
        memory = JSON.parse(saved) as State
      } catch {
        memory = initialState(includeDemoApplications)
      }
      localStorage.removeItem(LEGACY_KEY)
    }
  }

  return {
    get: () => memory,
    save: () => {
      if (storage === 'indexeddb' && typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(memory))
    },
    reset: () => {
      memory = initialState(includeDemoApplications)
      if (storage === 'indexeddb' && typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(memory))
    },
  }
}
```

(c) `listJobs` 内 `seasonId` 过滤之后加：

```ts
    if (query.favorite) items = items.filter((job) => job.favorite)
```

(d) `applications` 块的 `updateStage` 之后追加：

```ts
      async archive(id, value) {
        await delay()
        const application = state().applications.find((item) => item.id === id)
        if (!application) throw new ApiError('APPLICATION_NOT_FOUND', '投递记录不存在')
        application.archived = value
        application.updatedAt = new Date().toISOString()
        store.save()
      },
      async setNote(id, note) {
        await delay()
        const application = state().applications.find((item) => item.id === id)
        if (!application) throw new ApiError('APPLICATION_NOT_FOUND', '投递记录不存在')
        application.note = note
        application.updatedAt = new Date().toISOString()
        store.save()
        return clone(application)
      },
      reminders: {
        async add(applicationId, remindAt, title) {
          await delay()
          const application = state().applications.find((item) => item.id === applicationId)
          if (!application) throw new ApiError('APPLICATION_NOT_FOUND', '投递记录不存在')
          const reminder: Reminder = { id: crypto.randomUUID(), applicationId, title, remindAt, channels: ['in_app'], status: 'scheduled' }
          application.reminders.push(reminder)
          store.save()
          return clone(reminder)
        },
        async remove(id) {
          await delay()
          for (const application of state().applications) {
            if (application.reminders.some((item) => item.id === id)) application.reminders = application.reminders.filter((item) => item.id !== id)
          }
          store.save()
        },
      },
      async syncDueReminders() {
        await delay()
        const now = Date.now()
        const created: Notification[] = []
        for (const application of state().applications) {
          for (const reminder of application.reminders) {
            if (reminder.status !== 'scheduled' || Date.parse(reminder.remindAt) > now) continue
            reminder.status = 'sent'
            const notification: Notification = {
              id: crypto.randomUUID(),
              title: reminder.title,
              body: `${application.jobTitle}（${application.companyName}）的提醒已到期`,
              type: 'deadline',
              read: false,
              createdAt: new Date().toISOString(),
              href: '/me/workspace',
            }
            state().notifications.unshift(notification)
            created.push(notification)
          }
        }
        if (created.length) store.save()
        return clone(created)
      },
```

注意：v1 数据里 `Reminder.status`/`channels` 等字段已存在（domain 类型未变），无需额外字段迁移。

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @career-launch/api-client test && pnpm --filter @career-launch/api-client typecheck`
Expected: 全部 PASS（含原有 3 个用例）。

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/domain.ts packages/api-client/src/contracts.ts packages/api-client/src/mock/repository.ts packages/api-client/src/mock/repository.test.ts packages/api-client/package.json
git commit -m "feat: extend application repository with reminders, notes and archive"
```

---

### Task 2: 共享时间工具（daysUntil / formatDeadlineStatus / shanghaiDateKey）

**Files:**
- Modify: `packages/shared/src/format.ts`
- Test: `packages/shared/src/format.test.ts`（追加用例）

**Interfaces:**
- Produces:
  - `daysUntil(value: string, now?: Date): number`（上海日界；过去为负）
  - `formatDeadlineStatus(value: string, now?: Date): { days: number; label: string; tone: 'danger' | 'warning' | 'primary' | 'neutral' }`
  - `shanghaiDateKey(value: string): string`（ISO 字符串 → `YYYY-MM-DD` 上海日期）

- [ ] **Step 1: Write the failing tests**

在 `packages/shared/src/format.test.ts` 末尾追加（保留现有内容）：

```ts
import { daysUntil, formatDeadlineStatus, shanghaiDateKey } from './format'

describe('deadline status helpers', () => {
  const now = new Date('2026-10-01T04:00:00.000Z')

  it.each([
    ['2026-10-01T15:59:59.000Z', 0, '今天截止', 'danger'],
    ['2026-10-02T15:59:59.000Z', 1, '1 天后截止', 'warning'],
    ['2026-10-04T15:59:59.000Z', 3, '3 天后截止', 'warning'],
    ['2026-10-06T15:59:59.000Z', 5, '5 天后截止', 'primary'],
    ['2026-09-29T15:59:59.000Z', -2, '已过期 2 天', 'danger'],
  ] as const)('formatDeadlineStatus(%s)', (value, days, label, tone) => {
    expect(formatDeadlineStatus(value, now)).toEqual({ days, label, tone })
  })

  it('daysUntil is negative for past values', () => {
    expect(daysUntil('2026-09-30T00:00:00.000Z', now)).toBeLessThan(0)
  })

  it('maps ISO values onto Shanghai calendar dates', () => {
    expect(shanghaiDateKey('2026-10-01T17:30:00.000Z')).toBe('2026-10-02')
    expect(shanghaiDateKey('2026-10-01T02:30:00.000Z')).toBe('2026-10-01')
  })
})
```

（若原文件已有同名 import，合并即可；`now` 选 04:00Z 是上海中午，避免日界歧义。）

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @career-launch/shared test`
Expected: FAIL —— `daysUntil` 等导出不存在。

- [ ] **Step 3: Write minimal implementation**

在 `packages/shared/src/format.ts` 的 `formatDeadline` 函数之后追加：

```ts
export function daysUntil(value: string, now = new Date()): number {
  return shanghaiDay(new Date(value)) - shanghaiDay(now)
}

export interface DeadlineStatus {
  days: number
  label: string
  tone: 'danger' | 'warning' | 'primary' | 'neutral'
}

export function formatDeadlineStatus(value: string, now = new Date()): DeadlineStatus {
  const days = daysUntil(value, now)
  if (days < 0) return { days, label: `已过期 ${-days} 天`, tone: 'danger' }
  if (days <= 3) return { days, label: days === 0 ? '今天截止' : `${days} 天后截止`, tone: 'danger' }
  if (days <= 7) return { days, label: `${days} 天后截止`, tone: 'warning' }
  return { days, label: `${days} 天后截止`, tone: 'primary' }
}

export function shanghaiDateKey(value: string): string {
  return new Date(Date.parse(value) + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @career-launch/shared test`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/format.ts packages/shared/src/format.test.ts
git commit -m "feat: add deadline status and date key helpers"
```

---

### Task 3: 建议引擎（suggestions）

**Files:**
- Create: `apps/web/src/features/applications/suggestions.ts`
- Test: `apps/web/src/features/applications/suggestions.test.ts`

**Interfaces:**
- Consumes: `daysUntil`（Task 2）、`Application`/`Job`（shared）
- Produces:

```ts
export type SuggestionRule = 'expiring_favorite' | 'confirm' | 'interview_prep' | 'offer_decision' | 'follow_up'
export type SuggestionAction =
  | { kind: 'route'; label: string; to: string }
  | { kind: 'open-application'; label: string; applicationId: string }
  | { kind: 'confirm-application'; label: string; applicationId: string }
  | { kind: 'drop-application'; label: string; applicationId: string }
  | { kind: 'focus-note'; label: string; applicationId: string }
export interface Suggestion { id: string; rule: SuggestionRule; priority: number; message: string; actions: SuggestionAction[] }
export function buildSuggestions(input: { applications: Application[]; favoriteJobs: Job[]; now?: Date }, dismissed?: ReadonlySet<string>): Suggestion[]
```

- [ ] **Step 1: Write the failing tests**

```ts
import type { Application, Job } from '@career-launch/shared'
import { describe, expect, it } from 'vitest'

import { buildSuggestions } from './suggestions'

const NOW = new Date('2026-10-01T04:00:00.000Z')
const DAY = 24 * 60 * 60 * 1_000

function application(partial: Partial<Application> & { id: string }): Application {
  return {
    userId: 'user-1', jobId: 'job-x', jobTitle: '后端开发', companyName: '星海科技', companyLogoText: '星',
    city: ['上海'], deadlineAt: '2026-11-01T15:59:59.000Z', stage: 'applied', note: '', archived: false,
    events: [{ id: 'event-1', toStage: 'applied', occurredAt: new Date(NOW.getTime() - 9 * DAY).toISOString() }],
    reminders: [], updatedAt: new Date(NOW.getTime() - 9 * DAY).toISOString(),
    ...partial,
  }
}

function job(partial: Partial<Job> & { id: string }): Job {
  return {
    companyId: 'company-1', companyName: '云帆智能', companyLogoText: '云', seasonId: 'season-1', title: '算法工程师',
    category: '技术', city: ['杭州'], education: ['硕士'], majors: ['计算机'], salaryLabel: '25-40K·16薪',
    description: '', requirements: [], applyUrl: 'https://example.com', sourceLabel: '官方', publishedAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(), deadlineAt: '2026-11-01T15:59:59.000Z', status: 'active', featured: false, favorite: false,
    ...partial,
  }
}

describe('buildSuggestions', () => {
  it('returns an empty list for empty input', () => {
    expect(buildSuggestions({ applications: [], favoriteJobs: [], now: NOW })).toEqual([])
  })

  it('suggests a favorite job that expires within three days and has no application', () => {
    const favorite = job({ id: 'job-fav', favorite: true, deadlineAt: new Date(NOW.getTime() + 2 * DAY).toISOString() })
    const suggestions = buildSuggestions({ applications: [], favoriteJobs: [favorite], now: NOW })

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].rule).toBe('expiring_favorite')
    expect(suggestions[0].priority).toBe(0)
    expect(suggestions[0].actions[0]).toMatchObject({ kind: 'route', to: '/jobs/job-fav' })
  })

  it('ignores favorite jobs already applied, past deadline, or expiring in more than three days', () => {
    const applied = job({ id: 'job-applied', favorite: true, deadlineAt: new Date(NOW.getTime() + DAY).toISOString() })
    const expired = job({ id: 'job-expired', favorite: true, deadlineAt: new Date(NOW.getTime() - DAY).toISOString() })
    const later = job({ id: 'job-later', favorite: true, deadlineAt: new Date(NOW.getTime() + 5 * DAY).toISOString() })
    const suggestions = buildSuggestions({
      applications: [application({ id: 'app-1', jobId: 'job-applied' })],
      favoriteJobs: [applied, expired, later],
      now: NOW,
    })

    expect(suggestions.filter((item) => item.rule === 'expiring_favorite')).toEqual([])
  })

  it('nudges confirmations stalled over three days with both actions', () => {
    const pending = application({
      id: 'app-pending', stage: 'pending_confirmation',
      events: [{ id: 'e0', toStage: 'pending_confirmation', occurredAt: new Date(NOW.getTime() - 4 * DAY).toISOString() }],
    })
    const suggestions = buildSuggestions({ applications: [pending], favoriteJobs: [], now: NOW })

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].rule).toBe('confirm')
    expect(suggestions[0].actions.map((action) => action.kind)).toEqual(['confirm-application', 'drop-application'])
  })

  it('flags stagnant non-terminal applications after seven days, but never terminal ones', () => {
    const stagnant = application({ id: 'app-stale' })
    const terminal = application({ id: 'app-offer', stage: 'offer' })
    const suggestions = buildSuggestions({ applications: [stagnant, terminal], favoriteJobs: [], now: NOW })

    expect(suggestions.map((item) => item.rule)).toEqual(['offer_decision', 'follow_up'])
  })

  it('suggests interview preparation for interviews', () => {
    const interviewing = application({ id: 'app-int', stage: 'interview' })
    const suggestions = buildSuggestions({ applications: [interviewing], favoriteJobs: [], now: NOW })

    expect(suggestions[0].rule).toBe('interview_prep')
    expect(suggestions[0].actions[0]).toMatchObject({ kind: 'route', to: '/knowledge' })
  })

  it('excludes archived applications and dismissed suggestions, sorted by priority', () => {
    const dismissed = new Set(['confirm:app-pending'])
    const suggestions = buildSuggestions({
      applications: [
        application({ id: 'app-pending', stage: 'pending_confirmation', events: [{ id: 'e0', toStage: 'pending_confirmation', occurredAt: new Date(NOW.getTime() - 5 * DAY).toISOString() }] }),
        application({ id: 'app-gone', archived: true, stage: 'pending_confirmation', events: [{ id: 'e1', toStage: 'pending_confirmation', occurredAt: new Date(NOW.getTime() - 5 * DAY).toISOString() }] }),
        application({ id: 'app-stale' }),
      ],
      favoriteJobs: [],
      now: NOW,
    }, dismissed)

    expect(suggestions.map((item) => item.id)).toEqual(['follow_up:app-stale'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @career-launch/web test`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/features/applications/suggestions.ts`：

```ts
import type { Application, Job } from '@career-launch/shared'
import { daysUntil } from '@career-launch/shared'

export type SuggestionRule = 'expiring_favorite' | 'confirm' | 'interview_prep' | 'offer_decision' | 'follow_up'

export type SuggestionAction =
  | { kind: 'route'; label: string; to: string }
  | { kind: 'open-application'; label: string; applicationId: string }
  | { kind: 'confirm-application'; label: string; applicationId: string }
  | { kind: 'drop-application'; label: string; applicationId: string }
  | { kind: 'focus-note'; label: string; applicationId: string }

export interface Suggestion {
  id: string
  rule: SuggestionRule
  priority: number
  message: string
  actions: SuggestionAction[]
}

export interface SuggestionInput {
  applications: Application[]
  favoriteJobs: Job[]
  now?: Date
}

const TERMINAL_STAGES = new Set(['offer', 'rejected', 'closed'])

export function buildSuggestions(input: SuggestionInput, dismissed: ReadonlySet<string> = new Set()): Suggestion[] {
  const now = input.now ?? new Date()
  const suggestions: Suggestion[] = []
  const active = input.applications.filter((item) => !item.archived)

  for (const job of input.favoriteJobs) {
    if (job.status !== 'active') continue
    const days = daysUntil(job.deadlineAt, now)
    if (days < 0 || days > 3) continue
    if (active.some((item) => item.jobId === job.id)) continue
    suggestions.push({
      id: `expiring_favorite:${job.id}`,
      rule: 'expiring_favorite',
      priority: 0,
      message: `你收藏的「${job.title}」${days === 0 ? '今天' : days === 1 ? '明天' : `${days} 天后`}就截止了`,
      actions: [{ kind: 'route', label: '去看职位', to: `/jobs/${job.id}` }],
    })
  }

  for (const application of active) {
    const lastEvent = application.events[application.events.length - 1]
    const daysSinceUpdate = lastEvent ? -daysUntil(lastEvent.occurredAt, now) : 0

    if (application.stage === 'pending_confirmation' && daysSinceUpdate > 3) {
      suggestions.push({
        id: `confirm:${application.id}`,
        rule: 'confirm',
        priority: 1,
        message: `「${application.jobTitle}」还在待确认，是想再想想吗？`,
        actions: [
          { kind: 'confirm-application', label: '确认投递', applicationId: application.id },
          { kind: 'drop-application', label: '放弃', applicationId: application.id },
        ],
      })
    }

    if (application.stage === 'interview') {
      suggestions.push({
        id: `interview_prep:${application.id}`,
        rule: 'interview_prep',
        priority: 2,
        message: `「${application.companyName}」的面试在路上了，看看面经提前热身。`,
        actions: [{ kind: 'route', label: '直达面试宝典', to: '/knowledge' }],
      })
    }

    if (application.stage === 'offer') {
      suggestions.push({
        id: `offer_decision:${application.id}`,
        rule: 'offer_decision',
        priority: 2,
        message: `恭喜拿到「${application.companyName}」的 Offer！记得在截止日前回复。`,
        actions: [{ kind: 'focus-note', label: '记录答复', applicationId: application.id }],
      })
    }

    if (application.stage !== 'pending_confirmation' && !TERMINAL_STAGES.has(application.stage) && daysSinceUpdate > 7) {
      suggestions.push({
        id: `follow_up:${application.id}`,
        rule: 'follow_up',
        priority: 3,
        message: `「${application.companyName}」的「${application.jobTitle}」已经 ${daysSinceUpdate} 天没有动静了，发封跟进邮件试试？`,
        actions: [{ kind: 'open-application', label: '查看时间线', applicationId: application.id }],
      })
    }
  }

  return suggestions
    .filter((item) => !dismissed.has(item.id))
    .sort((a, b) => a.priority - b.priority)
}
```

注意：排序稳定性无要求，同优先级顺序不测试。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @career-launch/web test`
Expected: PASS（含既有测试）。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/applications/suggestions.ts apps/web/src/features/applications/suggestions.test.ts
git commit -m "feat: add workspace suggestion engine"
```

---

### Task 4: 统计模型（stats）

**Files:**
- Create: `apps/web/src/features/applications/stats.ts`
- Test: `apps/web/src/features/applications/stats.test.ts`

**Interfaces:**
- Consumes: `daysUntil`、`shanghaiDateKey`（Task 2）、`stageMeta`（`./stages`）
- Produces:

```ts
export interface StageCount { stage: ApplicationStage; label: string; count: number }
export interface DayCount { dateKey: string; weekday: string; count: number }
export interface WorkspaceStats { funnel: StageCount[]; weekly: DayCount[]; keyNumbers: { interviewing: number; offers: number; needsFollowUp: number } }
export function buildStats(applications: Application[], now?: Date): WorkspaceStats
```

- [ ] **Step 1: Write the failing tests**

```ts
import type { Application } from '@career-launch/shared'
import { describe, expect, it } from 'vitest'

import { buildStats } from './stats'

const NOW = new Date('2026-10-01T04:00:00.000Z')
const DAY = 24 * 60 * 60 * 1_000

function application(partial: Partial<Application> & { id: string }): Application {
  return {
    userId: 'user-1', jobId: 'job-x', jobTitle: '后端开发', companyName: '星海科技', companyLogoText: '星',
    city: ['上海'], deadlineAt: '2026-11-01T15:59:59.000Z', stage: 'applied', note: '', archived: false,
    events: [{ id: 'event-1', toStage: 'applied', occurredAt: new Date(NOW.getTime() - DAY).toISOString() }],
    reminders: [], updatedAt: new Date(NOW.getTime() - DAY).toISOString(),
    ...partial,
  }
}

describe('buildStats', () => {
  it('returns zeroed funnel and weekly for empty input', () => {
    const stats = buildStats([], NOW)

    expect(stats.funnel).toHaveLength(7)
    expect(stats.funnel.every((entry) => entry.count === 0)).toBe(true)
    expect(stats.weekly).toHaveLength(7)
    expect(stats.keyNumbers).toEqual({ interviewing: 0, offers: 0, needsFollowUp: 0 })
  })

  it('counts stages excluding archived applications', () => {
    const stats = buildStats([
      application({ id: 'a1', stage: 'interview' }),
      application({ id: 'a2', stage: 'interview' }),
      application({ id: 'a3', stage: 'offer' }),
      application({ id: 'a4', stage: 'offer', archived: true }),
    ], NOW)

    expect(stats.funnel.find((entry) => entry.stage === 'interview')?.count).toBe(2)
    expect(stats.funnel.find((entry) => entry.stage === 'offer')?.count).toBe(1)
    expect(stats.keyNumbers.interviewing).toBe(2)
    expect(stats.keyNumbers.offers).toBe(1)
  })

  it('counts the last seven days of submissions from appliedAt', () => {
    const stats = buildStats([
      application({ id: 'a1', appliedAt: new Date(NOW.getTime() - 2 * DAY).toISOString() }),
      application({ id: 'a2', appliedAt: new Date(NOW.getTime() - DAY).toISOString(), stage: 'offer' }),
      application({ id: 'a3', appliedAt: new Date(NOW.getTime() - 20 * DAY).toISOString() }),
    ], NOW)

    expect(stats.weekly.reduce((total, entry) => total + entry.count, 0)).toBe(2)
    expect(stats.weekly[6].count).toBe(1)
  })

  it('flags applications stagnant over seven days as needing follow-up', () => {
    const stale = application({ id: 'a1', events: [{ id: 'e1', toStage: 'applied', occurredAt: new Date(NOW.getTime() - 9 * DAY).toISOString() }] })
    const fresh = application({ id: 'a2', events: [{ id: 'e2', toStage: 'applied', occurredAt: new Date(NOW.getTime() - DAY).toISOString() }] })

    expect(buildStats([stale, fresh], NOW).keyNumbers.needsFollowUp).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @career-launch/web test`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/features/applications/stats.ts`：

```ts
import type { Application, ApplicationStage } from '@career-launch/shared'
import { daysUntil, shanghaiDateKey } from '@career-launch/shared'
import { stageMeta } from './stages'

export interface StageCount {
  stage: ApplicationStage
  label: string
  count: number
}

export interface DayCount {
  dateKey: string
  weekday: string
  count: number
}

export interface WorkspaceStats {
  funnel: StageCount[]
  weekly: DayCount[]
  keyNumbers: { interviewing: number; offers: number; needsFollowUp: number }
}

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const TERMINAL_STAGES = new Set<ApplicationStage>(['offer', 'rejected', 'closed'])

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function appliedDateKey(application: Application): string | null {
  const appliedAt = application.appliedAt ?? application.events[0]?.occurredAt
  return appliedAt ? shanghaiDateKey(appliedAt) : null
}

export function buildStats(applications: Application[], now = new Date()): WorkspaceStats {
  const active = applications.filter((item) => !item.archived)

  const funnel = (Object.keys(stageMeta) as ApplicationStage[]).map((stage) => ({
    stage,
    label: stageMeta[stage].label,
    count: active.filter((item) => item.stage === stage).length,
  }))

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekly: DayCount[] = []
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(today)
    day.setDate(day.getDate() - offset)
    weekly.push({ dateKey: localDateKey(day), weekday: WEEKDAY_LABELS[day.getDay()], count: 0 })
  }
  const weeklyByDate = new Map(weekly.map((entry) => [entry.dateKey, entry]))
  for (const application of active) {
    const entry = weeklyByDate.get(appliedDateKey(application) ?? '')
    if (entry) entry.count += 1
  }

  const keyNumbers = {
    interviewing: active.filter((item) => item.stage === 'interview').length,
    offers: active.filter((item) => item.stage === 'offer').length,
    needsFollowUp: active.filter((item) => {
      if (item.stage === 'pending_confirmation' || TERMINAL_STAGES.has(item.stage)) return false
      const lastEvent = item.events[item.events.length - 1]
      return lastEvent ? -daysUntil(lastEvent.occurredAt, now) > 7 : false
    }).length,
  }

  return { funnel, weekly, keyNumbers }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @career-launch/web test`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/applications/stats.ts apps/web/src/features/applications/stats.test.ts
git commit -m "feat: add workspace stats model"
```

---

### Task 5: 日历模型（calendar）

**Files:**
- Create: `apps/web/src/features/applications/calendar.ts`
- Test: `apps/web/src/features/applications/calendar.test.ts`

**Interfaces:**
- Consumes: `daysUntil`、`shanghaiDateKey`（Task 2）
- Produces:

```ts
export type CalendarTone = 'danger' | 'warning' | 'primary' | 'neutral'
export type CalendarEventKind = 'deadline' | 'reminder' | 'season_start' | 'season_end'
export interface CalendarEvent { kind: CalendarEventKind; label: string; tone: CalendarTone; applicationId?: string }
export interface CalendarCell { dateKey: string; day: number; inMonth: boolean; isToday: boolean; events: CalendarEvent[] }
export function localDateKey(date: Date): string
export function buildMonthGrid(year: number, month: number, now?: Date): Array<Omit<CalendarCell, 'events'>>
export function collectCalendarEvents(applications: Application[], seasons: RecruitmentSeason[], now?: Date): Map<string, CalendarEvent[]>
export function buildCalendar(applications: Application[], seasons: RecruitmentSeason[], year: number, month: number, now?: Date): CalendarCell[]
```

- [ ] **Step 1: Write the failing tests**

```ts
import type { Application, RecruitmentSeason } from '@career-launch/shared'
import { describe, expect, it } from 'vitest'

import { buildCalendar, buildMonthGrid, localDateKey } from './calendar'

const NOW = new Date(2026, 9, 1, 12, 0, 0)

function application(partial: Partial<Application> & { id: string }): Application {
  return {
    userId: 'user-1', jobId: 'job-x', jobTitle: '后端开发', companyName: '星海科技', companyLogoText: '星',
    city: ['上海'], deadlineAt: '2026-10-08T15:59:59.000Z', stage: 'applied', note: '', archived: false,
    events: [{ id: 'event-1', toStage: 'applied', occurredAt: '2026-09-20T10:00:00.000Z' }],
    reminders: [], updatedAt: '2026-09-20T10:00:00.000Z',
    ...partial,
  }
}

const SEASONS: RecruitmentSeason[] = [
  { id: 'season-1', name: '2027 届秋招', year: 2027, type: 'autumn', startsAt: '2026-10-06T16:00:00.000Z', endsAt: '2026-12-31T15:59:59.000Z', active: true },
]

describe('buildMonthGrid', () => {
  it('always renders 42 cells starting on Sunday', () => {
    const grid = buildMonthGrid(2026, 9, NOW)
    expect(grid).toHaveLength(42)
    expect(localDateKey(new Date(2026, 8, 27))).toBe(grid[0].dateKey)
  })

  it('marks today and out-of-month cells', () => {
    const grid = buildMonthGrid(2026, 9, NOW)
    const today = grid.find((cell) => cell.isToday)
    expect(today?.dateKey).toBe('2026-10-01')
    expect(grid[0].inMonth).toBe(false)
    expect(grid.find((cell) => cell.dateKey === '2026-10-01')?.inMonth).toBe(true)
  })
})

describe('buildCalendar', () => {
  it('places application deadlines, reminders and season bounds on the right days', () => {
    const app = application({
      id: 'a1',
      deadlineAt: '2026-10-08T15:59:59.000Z',
      reminders: [{ id: 'r1', applicationId: 'a1', title: '复盘笔试', remindAt: '2026-10-02T02:00:00.000Z', channels: ['in_app'], status: 'scheduled' }],
    })
    const cells = buildCalendar([app], SEASONS, 2026, 9, NOW)

    expect(cells.find((cell) => cell.dateKey === '2026-10-08')?.events.map((event) => event.kind)).toContain('deadline')
    expect(cells.find((cell) => cell.dateKey === '2026-10-02')?.events.map((event) => event.kind)).toContain('reminder')
    expect(cells.find((cell) => cell.dateKey === '2026-10-07')?.events.map((event) => event.kind)).toContain('season_start')
  })

  it('excludes archived applications and sent reminders, tones past deadlines neutral', () => {
    const cells = buildCalendar([
      application({ id: 'a1', archived: true, deadlineAt: '2026-10-08T15:59:59.000Z' }),
      application({ id: 'a2', deadlineAt: '2026-09-28T15:59:59.000Z' }),
    ], SEASONS, 2026, 9, NOW)

    expect(cells.find((cell) => cell.dateKey === '2026-10-08')?.events).toEqual([])
    expect(cells.find((cell) => cell.dateKey === '2026-09-28')?.events[0].tone).toBe('neutral')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @career-launch/web test`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/features/applications/calendar.ts`：

```ts
import type { Application, RecruitmentSeason } from '@career-launch/shared'
import { daysUntil, shanghaiDateKey } from '@career-launch/shared'

export type CalendarTone = 'danger' | 'warning' | 'primary' | 'neutral'
export type CalendarEventKind = 'deadline' | 'reminder' | 'season_start' | 'season_end'

export interface CalendarEvent {
  kind: CalendarEventKind
  label: string
  tone: CalendarTone
  applicationId?: string
}

export interface CalendarCell {
  dateKey: string
  day: number
  inMonth: boolean
  isToday: boolean
  events: CalendarEvent[]
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function buildMonthGrid(year: number, month: number, now = new Date()): Array<Omit<CalendarCell, 'events'>> {
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())
  const todayKey = localDateKey(now)
  const cells: Array<Omit<CalendarCell, 'events'>> = []
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    const dateKey = localDateKey(date)
    cells.push({ dateKey, day: date.getDate(), inMonth: date.getMonth() === month, isToday: dateKey === todayKey })
  }
  return cells
}

export function collectCalendarEvents(applications: Application[], seasons: RecruitmentSeason[], now = new Date()): Map<string, CalendarEvent[]> {
  const events = new Map<string, CalendarEvent[]>()
  const push = (key: string, event: CalendarEvent) => {
    const list = events.get(key) ?? []
    list.push(event)
    events.set(key, list)
  }

  for (const application of applications.filter((item) => !item.archived)) {
    const days = daysUntil(application.deadlineAt, now)
    const tone: CalendarTone = days < 0 ? 'neutral' : days <= 3 ? 'danger' : days <= 7 ? 'warning' : 'primary'
    push(shanghaiDateKey(application.deadlineAt), {
      kind: 'deadline',
      label: `${application.jobTitle} 截止`,
      tone,
      applicationId: application.id,
    })
    for (const reminder of application.reminders) {
      if (reminder.status !== 'scheduled') continue
      push(shanghaiDateKey(reminder.remindAt), {
        kind: 'reminder',
        label: reminder.title,
        tone: daysUntil(reminder.remindAt, now) <= 0 ? 'warning' : 'primary',
        applicationId: application.id,
      })
    }
  }

  for (const season of seasons) {
    push(shanghaiDateKey(season.startsAt), { kind: 'season_start', label: `${season.name} 开始`, tone: 'neutral' })
    push(shanghaiDateKey(season.endsAt), { kind: 'season_end', label: `${season.name} 结束`, tone: 'neutral' })
  }

  return events
}

export function buildCalendar(applications: Application[], seasons: RecruitmentSeason[], year: number, month: number, now = new Date()): CalendarCell[] {
  const events = collectCalendarEvents(applications, seasons, now)
  return buildMonthGrid(year, month, now).map((cell) => ({ ...cell, events: events.get(cell.dateKey) ?? [] }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @career-launch/web test`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/applications/calendar.ts apps/web/src/features/applications/calendar.test.ts
git commit -m "feat: add workspace calendar model"
```

---

### Task 6: 职位对比模型（compare）

**Files:**
- Create: `apps/web/src/features/jobs/compare.ts`
- Test: `apps/web/src/features/jobs/compare.test.ts`

**Interfaces:**
- Consumes: `Job`（shared）
- Produces:

```ts
export const MAX_COMPARE = 3
export interface CompareField { label: string; values: string[]; differs: boolean }
export function buildCompareRows(jobs: Job[]): CompareField[]
```

- [ ] **Step 1: Write the failing tests**

```ts
import type { Job } from '@career-launch/shared'
import { describe, expect, it } from 'vitest'

import { MAX_COMPARE, buildCompareRows } from './compare'

function job(partial: Partial<Job> & { id: string }): Job {
  return {
    companyId: 'company-1', companyName: '云帆智能', companyLogoText: '云', seasonId: 'season-1', title: '算法工程师',
    category: '技术', city: ['杭州'], education: ['硕士'], majors: ['计算机'], salaryLabel: '25-40K·16薪',
    description: '', requirements: ['熟悉机器学习'], applyUrl: 'https://example.com', sourceLabel: '官方',
    publishedAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    deadlineAt: '2026-10-15T15:59:59.000Z', status: 'active', featured: false, favorite: false,
    ...partial,
  }
}

describe('buildCompareRows', () => {
  it('marks fields that differ and unifies fields that match', () => {
    const rows = buildCompareRows([
      job({ id: 'j1', salaryLabel: '25-40K·16薪', city: ['杭州'] }),
      job({ id: 'j2', salaryLabel: '20-35K·14薪', city: ['杭州'] }),
    ])

    const salary = rows.find((row) => row.label === '薪资')
    const city = rows.find((row) => row.label === '工作城市')
    expect(salary?.values).toEqual(['25-40K·16薪', '20-35K·14薪'])
    expect(salary?.differs).toBe(true)
    expect(city?.differs).toBe(false)
  })

  it('returns one value per job in input order for every row', () => {
    const rows = buildCompareRows([job({ id: 'j1' }), job({ id: 'j2' }), job({ id: 'j3' })])
    expect(rows.every((row) => row.values)).toBe(true)
    expect(rows.every((row) => row.values.length === 3)).toBe(true)
  })

  it('caps the documented comparison size', () => {
    expect(MAX_COMPARE).toBe(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @career-launch/web test`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/features/jobs/compare.ts`：

```ts
import type { Job } from '@career-launch/shared'

export const MAX_COMPARE = 3

export interface CompareField {
  label: string
  values: string[]
  differs: boolean
}

interface RowDefinition {
  label: string
  get: (job: Job) => string
}

const ROW_DEFINITIONS: RowDefinition[] = [
  { label: '薪资', get: (job) => job.salaryLabel },
  { label: '工作城市', get: (job) => job.city.join(' / ') },
  { label: '学历要求', get: (job) => job.education.join(' / ') },
  { label: '职位类别', get: (job) => job.category },
  { label: '公司', get: (job) => job.companyName },
  { label: '投递截止', get: (job) => new Date(job.deadlineAt).toLocaleDateString('zh-CN') },
  { label: '职位要求', get: (job) => job.requirements.join('；') || '—' },
]

export function buildCompareRows(jobs: Job[]): CompareField[] {
  return ROW_DEFINITIONS.map(({ label, get }) => {
    const values = jobs.map(get)
    return { label, values, differs: new Set(values).size > 1 }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @career-launch/web test`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/jobs/compare.ts apps/web/src/features/jobs/compare.test.ts
git commit -m "feat: add job comparison model"
```

---

### Task 7: 骨架屏组件（SkeletonCard）

**Files:**
- Create: `packages/ui/src/components/SkeletonCard.vue`
- Modify: `packages/ui/src/index.ts`
- Test: `packages/ui/src/components/SkeletonCard.test.ts`

**Interfaces:**
- Produces: `<SkeletonCard :lines="3" label="正在加载" />`（`role="status"`），从 `@career-launch/ui` 导出。

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @career-launch/ui test`
Expected: FAIL —— 组件不存在。

- [ ] **Step 3: Write minimal implementation**

`packages/ui/src/components/SkeletonCard.vue`：

```vue
<script setup lang="ts">
withDefaults(defineProps<{ lines?: number; label?: string }>(), { lines: 3, label: '正在加载' })
</script>
<template>
  <div class="skeleton-card" role="status" :aria-label="label">
    <span class="bar bar-title" />
    <span v-for="line in lines" :key="line" class="bar" :style="{ width: `${58 + ((line * 23) % 36)}%` }" />
  </div>
</template>
<style scoped>
.skeleton-card{display:grid;gap:10px;padding:18px;border-radius:10px;background:var(--cl-surface)}
.bar{display:block;height:12px;border-radius:6px;background:color-mix(in srgb,var(--cl-border) 70%,transparent);animation:skeleton-pulse 1.2s ease-in-out infinite}
.bar-title{width:38%;height:16px}
@keyframes skeleton-pulse{0%,100%{opacity:.45}50%{opacity:1}}
@media(prefers-reduced-motion:reduce){.bar{animation:none}}
</style>
```

`packages/ui/src/index.ts` 追加一行导出：

```ts
export { default as SkeletonCard } from './components/SkeletonCard.vue'
```

（测试断言 `.bar` 总数 = lines + 1（标题条），故 4 行 → 5 条。）

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @career-launch/ui test`
Expected: PASS（含既有 EmptyState 测试）。

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/SkeletonCard.vue packages/ui/src/components/SkeletonCard.test.ts packages/ui/src/index.ts
git commit -m "feat: add skeleton loading card"
```

---

### Task 8: 投递详情抽屉升级（备注 / 提醒 / 归档真正落地）

**Files:**
- Create: `apps/web/src/features/applications/ApplicationDrawer.vue`
- 从 `ApplicationsPage.vue` 中抽屉部分迁移并升级（旧文件在 Task 13 删除）

**Interfaces:**
- Consumes: Task 1 的 `setNote`/`reminders`/`archive`/`updateStage`；`canTransition`/`stageMeta`（`./stages`）
- Produces:

```ts
props: { application: Application | null; focusNote?: boolean }
emits: { close: [] }
inject: 'reloadApplications'（() => void，缺省为 no-op）
```

**说明：** 组件测试需 mock 仓储单例，超出本仓库现有测试惯例（web 端无数据层注入机制），本任务验证方式为 typecheck + Task 15 的手动验收。抽屉内的业务规则（阶段流转、时间线）复用旧实现。

- [ ] **Step 1: Write the implementation**

`apps/web/src/features/applications/ApplicationDrawer.vue`：

```vue
<script setup lang="ts">
import type { Application, ApplicationStage, Reminder } from '@career-launch/shared'
import { computed, inject, nextTick, ref, watch } from 'vue'
import { repository } from '../../services/repository'
import { canTransition, stageMeta } from './stages'

const props = defineProps<{ application: Application | null; focusNote?: boolean }>()
const emit = defineEmits<{ close: [] }>()

const reload = inject<() => void>('reloadApplications', () => {})
const stages = Object.keys(stageMeta) as ApplicationStage[]
const noteDraft = ref('')
const reminderTitle = ref('')
const reminderAt = ref('')
const savingNote = ref(false)
const confirmArchive = ref(false)
const noteInput = ref<HTMLTextAreaElement | null>(null)

const reminders = computed(() => props.application?.reminders ?? [])

watch(
  () => props.application,
  async (value) => {
    noteDraft.value = value?.note ?? ''
    reminderTitle.value = ''
    reminderAt.value = ''
    confirmArchive.value = false
    if (value && props.focusNote) {
      await nextTick()
      noteInput.value?.focus()
    }
  },
  { immediate: true },
)

async function changeStage(event: Event) {
  if (!props.application) return
  const next = (event.target as HTMLSelectElement).value as ApplicationStage
  if (!canTransition(props.application.stage, next)) return
  await repository.applications.updateStage(props.application.id, next)
  await reload()
}

async function saveNote() {
  if (!props.application) return
  savingNote.value = true
  await repository.applications.setNote(props.application.id, noteDraft.value)
  savingNote.value = false
  await reload()
}

async function addReminder() {
  if (!props.application || !reminderAt.value || !reminderTitle.value.trim()) return
  await repository.applications.reminders.add(props.application.id, new Date(reminderAt.value).toISOString(), reminderTitle.value.trim())
  await reload()
}

async function removeReminder(reminder: Reminder) {
  await repository.applications.reminders.remove(reminder.id)
  await reload()
}

async function toggleArchive() {
  if (!props.application) return
  if (!confirmArchive.value) {
    confirmArchive.value = true
    return
  }
  await repository.applications.archive(props.application.id, !props.application.archived)
  emit('close')
  await reload()
}
</script>
<template>
  <div v-if="application" class="drawer-layer" @mousedown.self="emit('close')">
    <aside class="drawer" role="dialog" aria-modal="true" aria-label="投递详情">
      <button class="close" type="button" aria-label="关闭详情" @click="emit('close')">×</button>
      <span class="logo large" aria-hidden="true">{{ application.companyLogoText }}</span>
      <h2>{{ application.jobTitle }}</h2>
      <p>{{ application.companyName }} · {{ application.city.join(' / ') }}</p>

      <label>
        当前阶段
        <select :value="application.stage" aria-label="更新投递阶段" @change="changeStage">
          <option v-for="stage in stages" :key="stage" :value="stage" :disabled="!canTransition(application.stage, stage)">
            {{ stageMeta[stage].label }}
          </option>
        </select>
      </label>

      <h3>备注</h3>
      <textarea ref="noteInput" v-model="noteDraft" rows="3" aria-label="投递备注" placeholder="记录笔试安排、面试要点或答复计划…" />
      <button class="cl-quiet-button" type="button" :disabled="savingNote" @click="saveNote">
        {{ savingNote ? '保存中…' : '保存备注' }}
      </button>

      <h3>下一步提醒</h3>
      <ul v-if="reminders.length" class="reminder-list">
        <li v-for="reminder in reminders" :key="reminder.id">
          <div>
            <strong>{{ reminder.title }}</strong>
            <small>{{ new Date(reminder.remindAt).toLocaleString('zh-CN') }} · {{ reminder.status === 'sent' ? '已送达' : '已排期' }}</small>
          </div>
          <button class="cl-quiet-button danger" type="button" :aria-label="`删除提醒：${reminder.title}`" @click="removeReminder(reminder)">删除</button>
        </li>
      </ul>
      <p v-else class="hint">还没有提醒。设置一个，到时间会出现在通知中心。</p>
      <div class="reminder-form">
        <input v-model="reminderTitle" type="text" aria-label="提醒标题" placeholder="做什么，比如“准备笔试”" />
        <input v-model="reminderAt" type="datetime-local" aria-label="提醒时间" />
        <button class="cl-primary-button" type="button" :disabled="!reminderTitle.trim() || !reminderAt" @click="addReminder">设置提醒</button>
      </div>

      <h3>进度时间线</h3>
      <ol class="timeline">
        <li v-for="event in application.events" :key="event.id">
          <span />
          <div>
            <strong>{{ stageMeta[event.toStage].label }}</strong>
            <small>{{ new Date(event.occurredAt).toLocaleString('zh-CN') }}</small>
            <p v-if="event.note">{{ event.note }}</p>
          </div>
        </li>
      </ol>

      <button class="archive-button" type="button" @click="toggleArchive">
        {{ application.archived ? '恢复这条投递记录' : confirmArchive ? '再点一次确认归档（归档后可在列表恢复）' : application.archived ? '恢复' : '归档这条投递' }}
      </button>
    </aside>
  </div>
</template>
<style scoped>
.drawer-layer{position:fixed;z-index:80;inset:0;background:rgba(8,15,29,.45)}
.drawer{position:absolute;top:0;right:0;width:min(100%,430px);height:100%;overflow:auto;padding:30px;background:var(--cl-surface);box-shadow:var(--cl-shadow-float)}
.close{position:absolute;top:16px;right:16px;width:36px;height:36px;border:0;border-radius:50%;background:var(--cl-canvas);font-size:22px}
.logo.large{width:52px;height:52px;display:grid;place-items:center;border-radius:10px;color:var(--cl-primary);background:var(--cl-primary-soft);font-weight:800}
.drawer h2{margin:14px 0 2px}
.drawer>p{color:var(--cl-muted)}
.drawer label{display:grid;gap:6px;margin:20px 0}
.drawer h3{margin-top:28px;font-size:16px}
.drawer select,.drawer textarea,.reminder-form input{width:100%;padding:8px 9px;border:1px solid var(--cl-border);border-radius:7px;color:var(--cl-text);background:var(--cl-surface)}
.drawer textarea{resize:vertical}
.timeline{padding:0;list-style:none}
.timeline li{display:grid;grid-template-columns:12px 1fr;gap:10px;padding:8px 0}
.timeline li>span{width:9px;height:9px;margin-top:7px;border-radius:50%;background:var(--cl-primary)}
.timeline small{display:block;color:var(--cl-muted)}
.timeline p{margin:4px 0}
.reminder-list{padding:0;margin:0;list-style:none}
.reminder-list li{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--cl-border)}
.reminder-list small{display:block;color:var(--cl-muted)}
.hint{color:var(--cl-muted);font-size:13px}
.reminder-form{display:grid;gap:8px;margin-top:8px}
.reminder-form .cl-primary-button{min-height:38px}
.cl-quiet-button.danger{color:var(--cl-danger, #c2410c)}
.archive-button{width:100%;min-height:40px;margin-top:24px;border:1px solid var(--cl-border);border-radius:8px;color:var(--cl-muted);background:transparent}
@media(max-width:650px){.drawer{padding:22px}}
</style>
```

（`--cl-danger` 若令牌未定义，回退值 `#c2410c` 保证可用；不要改 tokens.css。）

- [ ] **Step 2: Run typecheck and existing tests**

Run: `pnpm --filter @career-launch/web typecheck && pnpm --filter @career-launch/web test`
Expected: typecheck PASS；测试 PASS（新组件尚无人引用，不影响现有用例）。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/applications/ApplicationDrawer.vue
git commit -m "feat: add upgraded application drawer with notes, reminders and archive"
```

---

### Task 9: 看板视图（ApplicationsBoard）

**Files:**
- Create: `apps/web/src/features/applications/ApplicationsBoard.vue`

**Interfaces:**
- Consumes: Task 1 `archive`；`daysUntil`/`formatDeadlineStatus`（Task 2）；`stageMeta`
- Produces:

```ts
props: { applications: Application[] }
emits: { 'open-application': [payload: { id: string; focusNote?: boolean }] }
inject: 'reloadApplications'
```

**验证方式：** typecheck + 现有测试 + Task 15 手动验收（同 Task 8 理由）。

- [ ] **Step 1: Write the implementation**

`apps/web/src/features/applications/ApplicationsBoard.vue`：

```vue
<script setup lang="ts">
import type { Application, ApplicationStage } from '@career-launch/shared'
import { daysUntil, formatDeadlineStatus } from '@career-launch/shared'
import { computed, inject, ref } from 'vue'
import { StatusBadge } from '@career-launch/ui'
import { repository } from '../../services/repository'
import { stageMeta } from './stages'

const props = defineProps<{ applications: Application[] }>()
const emit = defineEmits<{ 'open-application': [payload: { id: string; focusNote?: boolean }] }>()
const reload = inject<() => void>('reloadApplications', () => {})

const stages = Object.keys(stageMeta) as ApplicationStage[]
const confirmArchiveId = ref<string | null>(null)

const active = computed(() => props.applications.filter((item) => !item.archived))
const grouped = computed(() =>
  Object.fromEntries(stages.map((stage) => [stage, active.value.filter((item) => item.stage === stage)])) as Record<ApplicationStage, Application[]>,
)

function idleDays(application: Application): number {
  const last = application.events[application.events.length - 1]
  return last ? -daysUntil(last.occurredAt) : 0
}

function deadline(application: Application) {
  return formatDeadlineStatus(application.deadlineAt)
}

async function archive(id: string) {
  await repository.applications.archive(id, true)
  confirmArchiveId.value = null
  await reload()
}
</script>
<template>
  <div class="board">
    <section v-for="stage in stages" :key="stage">
      <header>
        <StatusBadge :tone="stageMeta[stage].tone">{{ stageMeta[stage].label }}</StatusBadge>
        <span>{{ grouped[stage].length }}</span>
      </header>
      <button
        v-for="item in grouped[stage]"
        :key="item.id"
        class="application-card"
        type="button"
        @click="emit('open-application', { id: item.id })"
      >
        <span class="logo" aria-hidden="true">{{ item.companyLogoText }}</span>
        <strong>{{ item.jobTitle }}</strong>
        <small>{{ item.companyName }} · {{ item.city.join(' / ') }}</small>
        <time :title="new Date(item.updatedAt).toLocaleString('zh-CN')">停留 {{ idleDays(item) }} 天</time>
        <span v-if="deadline(item).days <= 7 && deadline(item).days >= 0" class="deadline-chip" :class="deadline(item).tone">
          {{ deadline(item).label }}
        </span>
        <span
          v-if="idleDays(item) > 7"
          class="stale-chip"
          role="img"
          :aria-label="`已 ${idleDays(item)} 天无进展，建议跟进`"
          :title="`已 ${idleDays(item)} 天无进展，建议跟进`"
        >…</span>
        <span
          v-if="confirmArchiveId === item.id"
          class="archive-confirm"
          role="group"
          :aria-label="`确认归档 ${item.jobTitle}`"
          @click.stop
        >
          <button class="cl-quiet-button" type="button" @click.stop="confirmArchiveId = null">取消</button>
          <button class="cl-quiet-button" type="button" @click.stop="archive(item.id)">确认归档</button>
        </span>
        <button
          v-else
          class="archive-link"
          type="button"
          :aria-label="`归档 ${item.jobTitle}`"
          @click.stop="confirmArchiveId = item.id"
        >归档</button>
      </button>
    </section>
  </div>
</template>
<style scoped>
.board{display:grid;grid-template-columns:repeat(7,minmax(210px,1fr));gap:10px;overflow-x:auto;padding-bottom:12px}
.board>section{min-height:390px;padding:11px;border-radius:10px;background:var(--cl-border)}
.board>section>header{display:flex;justify-content:space-between;margin-bottom:10px}
.board>section>header>span{color:var(--cl-muted)}
.application-card{position:relative;width:100%;display:grid;grid-template-columns:34px 1fr auto;gap:3px 9px;margin-bottom:8px;padding:12px;border:0;border-radius:9px;color:var(--cl-text);background:var(--cl-surface);text-align:left}
.logo{width:34px;height:34px;display:grid;grid-row:span 2;place-items:center;border-radius:8px;color:var(--cl-primary);background:var(--cl-primary-soft);font-weight:800}
.application-card strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.application-card small{grid-column:2;color:var(--cl-muted);font-size:11px}
.application-card time{grid-column:1/-1;margin-top:4px;color:var(--cl-muted);font-size:11px}
.deadline-chip{grid-column:1/-1;justify-self:start;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600}
.deadline-chip.danger{color:#b42318;background:color-mix(in srgb,#f04438 14%,transparent)}
.deadline-chip.warning{color:#b54708;background:color-mix(in srgb,#f79009 16%,transparent)}
.deadline-chip.primary{color:var(--cl-primary);background:var(--cl-primary-soft)}
.stale-chip{position:absolute;top:10px;right:10px;color:var(--cl-muted);font-weight:700}
.archive-link{position:absolute;bottom:8px;right:8px;border:0;color:var(--cl-muted);background:transparent;font-size:11px;text-decoration:underline}
.archive-link:hover{color:var(--cl-text)}
.archive-confirm{position:absolute;bottom:6px;right:8px;display:flex;gap:4px}
@media(max-width:650px){.application-card{grid-template-columns:34px 1fr}}
</style>
```

- [ ] **Step 2: Run typecheck and existing tests**

Run: `pnpm --filter @career-launch/web typecheck && pnpm --filter @career-launch/web test`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/applications/ApplicationsBoard.vue
git commit -m "feat: add workspace board view with deadline chips and idle hints"
```

---

### Task 10: 列表视图（ApplicationsList，筛选 / 排序 / 批量归档）

**Files:**
- Create: `apps/web/src/features/applications/ApplicationsList.vue`

**Interfaces:**
- Consumes: Task 1 `archive`；`stageMeta`；`formatDeadlineStatus`（Task 2）
- Produces:

```ts
props: { applications: Application[] }
emits: { 'open-application': [payload: { id: string; focusNote?: boolean }] }
inject: 'reloadApplications'
```

**验证方式：** typecheck + 现有测试 + Task 15 手动验收。

- [ ] **Step 1: Write the implementation**

`apps/web/src/features/applications/ApplicationsList.vue`：

```vue
<script setup lang="ts">
import type { Application, ApplicationStage } from '@career-launch/shared'
import { formatDeadlineStatus } from '@career-launch/shared'
import { computed, inject, ref } from 'vue'
import { StatusBadge } from '@career-launch/ui'
import { repository } from '../../services/repository'
import { stageMeta } from './stages'

const props = defineProps<{ applications: Application[] }>()
const emit = defineEmits<{ 'open-application': [payload: { id: string; focusNote?: boolean }] }>()
const reload = inject<() => void>('reloadApplications', () => {})

const stageFilter = ref<'all' | ApplicationStage>('all')
const archiveFilter = ref<'active' | 'archived' | 'all'>('active')
const sortKey = ref<'updated' | 'deadline'>('updated')
const selected = ref(new Set<string>())
const batchConfirm = ref(false)

const rows = computed(() => {
  let items = props.applications.slice()
  if (archiveFilter.value === 'active') items = items.filter((item) => !item.archived)
  if (archiveFilter.value === 'archived') items = items.filter((item) => item.archived)
  if (stageFilter.value !== 'all') items = items.filter((item) => item.stage === stageFilter.value)
  items.sort((a, b) =>
    sortKey.value === 'deadline' ? a.deadlineAt.localeCompare(b.deadlineAt) : b.updatedAt.localeCompare(a.updatedAt),
  )
  return items
})

const allSelected = computed(() => rows.value.length > 0 && rows.value.every((item) => selected.value.has(item.id)))

function toggleRow(id: string) {
  if (selected.value.has(id)) selected.value.delete(id)
  else selected.value.add(id)
}

function toggleAll() {
  if (allSelected.value) selected.value.clear()
  else rows.value.forEach((item) => selected.value.add(item.id))
}

async function batchArchive(value: boolean) {
  for (const id of selected.value) await repository.applications.archive(id, value)
  selected.value.clear()
  batchConfirm.value = false
  await reload()
}
</script>
<template>
  <div class="list-tools">
    <label>
      阶段
      <select v-model="stageFilter" aria-label="按阶段筛选">
        <option value="all">全部阶段</option>
        <option v-for="(meta, stage) in stageMeta" :key="stage" :value="stage">{{ meta.label }}</option>
      </select>
    </label>
    <label>
      状态
      <select v-model="archiveFilter" aria-label="按归档状态筛选">
        <option value="active">进行中</option>
        <option value="archived">已归档</option>
        <option value="all">全部</option>
      </select>
    </label>
    <label>
      排序
      <select v-model="sortKey" aria-label="排序方式">
        <option value="updated">最近更新</option>
        <option value="deadline">截止优先</option>
      </select>
    </label>
  </div>

  <div v-if="selected.size" class="batch-bar" role="region" aria-label="批量操作">
    <span>已选 {{ selected.size }} 条投递</span>
    <template v-if="batchConfirm">
      <span class="batch-warning">归档后记录会移出看板，可随时在“已归档”筛选里恢复。</span>
      <button class="cl-quiet-button" type="button" @click="batchConfirm = false">取消</button>
      <button class="cl-primary-button" type="button" @click="batchArchive(true)">确认归档</button>
    </template>
    <template v-else>
      <button class="cl-quiet-button" type="button" @click="batchConfirm = true">批量归档</button>
      <button class="cl-quiet-button" type="button" :disabled="archiveFilter !== 'archived'" @click="batchArchive(false)">批量恢复</button>
    </template>
  </div>

  <div class="application-list cl-card">
    <article v-for="item in rows" :key="item.id" :class="{ archived: item.archived }">
      <input
        type="checkbox"
        :checked="selected.has(item.id)"
        :aria-label="`选择 ${item.jobTitle}`"
        @change="toggleRow(item.id)"
      />
      <span class="logo" aria-hidden="true">{{ item.companyLogoText }}</span>
      <div>
        <strong>{{ item.jobTitle }}</strong>
        <small>{{ item.companyName }} · {{ item.city.join(' / ') }}</small>
        <small :title="new Date(item.deadlineAt).toLocaleDateString('zh-CN')">{{ formatDeadlineStatus(item.deadlineAt).label }}</small>
      </div>
      <StatusBadge :tone="stageMeta[item.stage].tone">{{ stageMeta[item.stage].label }}</StatusBadge>
      <button class="cl-quiet-button" type="button" @click="emit('open-application', { id: item.id })">详情</button>
    </article>
    <div v-if="!rows.length" class="list-empty">这个筛选下没有投递记录。换个条件，或去职位列表看看新机会。</div>
  </div>
</template>
<style scoped>
.list-tools{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:14px}
.list-tools label{display:grid;gap:4px;color:var(--cl-muted);font-size:12px}
.list-tools select{height:36px;padding:0 9px;border:1px solid var(--cl-border);border-radius:7px;color:var(--cl-text);background:var(--cl-surface)}
.batch-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:12px;padding:10px 14px;border-radius:9px;background:var(--cl-primary-soft)}
.batch-warning{color:var(--cl-muted);font-size:12px}
.application-list article{display:grid;grid-template-columns:auto 40px 1fr 90px auto;gap:12px;align-items:center;padding:14px 18px}
.application-list article+article{border-top:1px solid var(--cl-border)}
.application-list article.archived{opacity:.55}
.application-list strong,.application-list small{display:block}
.application-list small{color:var(--cl-muted);font-size:11px}
.logo{width:40px;height:40px;display:grid;place-items:center;border-radius:8px;color:var(--cl-primary);background:var(--cl-primary-soft);font-weight:800}
.list-empty{padding:36px;text-align:center;color:var(--cl-muted)}
@media(max-width:650px){.application-list article{grid-template-columns:auto 36px 1fr}.application-list article>*:nth-child(n+4){grid-column:2}}
</style>
```

（注意 `v-for="(meta, stage) in stageMeta"` 中 `stage` 是 string，需 `:value="stage as ApplicationStage"`？不需要——`v-model` 绑定到联合类型 ref，模板编译不报错；若 typecheck 报错，把 option 循环改为 `v-for="stage in (Object.keys(stageMeta) as ApplicationStage[])" :key="stage" :value="stage"`。）

- [ ] **Step 2: Run typecheck and existing tests**

Run: `pnpm --filter @career-launch/web typecheck && pnpm --filter @career-launch/web test`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/applications/ApplicationsList.vue
git commit -m "feat: add workspace list view with filters and batch archive"
```

---

### Task 11: 今日聚焦（TodayFocus）

**Files:**
- Create: `apps/web/src/features/applications/TodayFocus.vue`

**Interfaces:**
- Consumes: Task 3 `buildSuggestions`/`SuggestionAction`；Task 4 `buildStats`；Task 7 `SkeletonCard`；Task 1 `jobs.list({favorite:true})`/`syncDueReminders`/`updateStage`/`archive`
- Produces:

```ts
props: { applications: Application[]; loading: boolean }
emits: { 'open-application': [payload: { id: string; focusNote?: boolean }] }
inject: 'reloadApplications'
```

**验证方式：** typecheck + 现有测试 + Task 15 手动验收（建议引擎逻辑已在 Task 3 单测覆盖）。

- [ ] **Step 1: Write the implementation**

`apps/web/src/features/applications/TodayFocus.vue`：

```vue
<script setup lang="ts">
import type { Application, Job, Notification } from '@career-launch/shared'
import { daysUntil } from '@career-launch/shared'
import { EmptyState, SkeletonCard } from '@career-launch/ui'
import { computed, inject, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { repository } from '../../services/repository'
import { buildSuggestions, type SuggestionAction } from './suggestions'
import { buildStats } from './stats'

const props = defineProps<{ applications: Application[]; loading: boolean }>()
const emit = defineEmits<{ 'open-application': [payload: { id: string; focusNote?: boolean }] }>()
const reload = inject<() => void>('reloadApplications', () => {})
const router = useRouter()

const favoriteJobs = ref<Job[]>([])
const dueNotifications = ref<Notification[]>([])
const dismissed = ref(new Set<string>())
const pendingDropId = ref<string | null>(null)

onMounted(async () => {
  dueNotifications.value = await repository.applications.syncDueReminders()
  const page = await repository.jobs.list({ city: [], category: [], education: [], sort: 'deadline', page: 1, pageSize: 100, favorite: true })
  favoriteJobs.value = page.items.filter((job) => job.status === 'active')
})

const suggestions = computed(() => buildSuggestions({ applications: props.applications, favoriteJobs: favoriteJobs.value }, dismissed.value))

const visibleSuggestions = computed(() => suggestions.value.slice(0, 5))
const hiddenCount = computed(() => Math.max(0, suggestions.value.length - 5))

const expiring = computed(() => {
  const fromApplications = props.applications
    .filter((item) => !item.archived && !['offer', 'rejected', 'closed'].includes(item.stage))
    .map((item) => ({ id: item.id, jobTitle: item.jobTitle, days: daysUntil(item.deadlineAt), applicationId: item.id }))
  const fromFavorites = favoriteJobs.value
    .filter((job) => !props.applications.some((item) => item.jobId === job.id && !item.archived))
    .map((job) => ({ id: job.id, jobTitle: job.title, days: daysUntil(job.deadlineAt), applicationId: null }))
  return [...fromApplications, ...fromFavorites]
    .filter((entry) => entry.days >= 0 && entry.days <= 7)
    .sort((a, b) => a.days - b.days)
})

const stats = computed(() => buildStats(props.applications))

const dueReminders = computed(() =>
  props.applications
    .filter((item) => !item.archived)
    .flatMap((item) => item.reminders.map((reminder) => ({ reminder, item })))
    .filter(({ reminder }) => reminder.status !== 'cancelled' && daysUntil(reminder.remindAt) <= 0)
    .sort((a, b) => a.reminder.remindAt.localeCompare(b.reminder.remindAt)),
)

const maxFunnel = computed(() => Math.max(1, ...stats.value.funnel.map((entry) => entry.count)))
const maxWeekly = computed(() => Math.max(1, ...stats.value.weekly.map((entry) => entry.count)))

function dismiss(id: string) {
  dismissed.value = new Set(dismissed.value).add(id)
}

async function runAction(action: SuggestionAction) {
  if (action.kind === 'route') {
    await router.push(action.to)
    return
  }
  if (action.kind === 'confirm-application') {
    await repository.applications.updateStage(action.applicationId, 'applied', '确认投递（来自工作台建议）')
    await reload()
    return
  }
  if (action.kind === 'drop-application') {
    pendingDropId.value = action.applicationId
    return
  }
  if (action.kind === 'focus-note') {
    emit('open-application', { id: action.applicationId, focusNote: true })
    return
  }
  emit('open-application', { id: action.applicationId })
}

async function confirmDrop(applicationId: string) {
  await repository.applications.archive(applicationId, true)
  pendingDropId.value = null
  await reload()
}
</script>
<template>
  <SkeletonCard v-if="loading" :lines="6" label="正在加载工作台" />

  <template v-else>
    <EmptyState
      v-if="!applications.length"
      title="还没有投递记录"
      description="从浏览在招职位开始，看到心动的机会就点“我要投递”，这里会帮你盯着每一步。"
      action-label="去逛职位库"
      @action="router.push('/jobs')"
    />

    <template v-else>
      <section v-if="expiring.length" class="expiring-banner" aria-label="临期预警">
        <h2>⏰ 临近截止</h2>
        <ul>
          <li v-for="entry in expiring" :key="entry.id" :class="{ urgent: entry.days <= 3 }">
            <button type="button" @click="entry.applicationId ? emit('open-application', { id: entry.applicationId }) : router.push(`/jobs/${entry.id}`)">
              {{ entry.jobTitle }} · {{ entry.days === 0 ? '今天' : `${entry.days} 天后` }}截止
            </button>
          </li>
        </ul>
      </section>

      <section aria-label="今日建议">
        <h2>今天可以做的</h2>
        <ul v-if="visibleSuggestions.length" class="suggestions">
          <li v-for="suggestion in visibleSuggestions" :key="suggestion.id" class="suggestion-card">
            <p>{{ suggestion.message }}</p>
            <div class="actions">
              <template v-if="pendingDropId === (suggestion.actions.find((action) => action.kind === 'drop-application') as { applicationId: string } | undefined)?.applicationId">
                <span class="drop-warning">归档后记录会移出看板，确定放弃吗？</span>
                <button class="cl-quiet-button" type="button" @click="pendingDropId = null">再想想</button>
                <button class="cl-primary-button" type="button" @click="confirmDrop(pendingDropId!)">确定放弃</button>
              </template>
              <template v-else>
                <button
                  v-for="action in suggestion.actions"
                  :key="action.kind + (action.kind === 'route' ? action.to : action.applicationId)"
                  class="cl-quiet-button"
                  type="button"
                  @click="runAction(action)"
                >{{ action.label }}</button>
              </template>
              <button class="dismiss" type="button" :aria-label="`不再提醒：${suggestion.message}`" @click="dismiss(suggestion.id)">不再提醒</button>
            </div>
          </li>
        </ul>
        <p v-else class="all-clear">没有待办建议——要么全在正轨上，要么该去投几份新的了 👀</p>
        <p v-if="hiddenCount" class="more-suggestions">还有 {{ hiddenCount }} 条建议，处理完上面的再看</p>
      </section>

      <section aria-label="求职统计">
        <h2>你的投递节奏</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <strong>{{ stats.keyNumbers.interviewing }}</strong><span>面试中</span>
          </div>
          <div class="stat-card">
            <strong>{{ stats.keyNumbers.offers }}</strong><span>Offer</span>
          </div>
          <div class="stat-card">
            <strong>{{ stats.keyNumbers.needsFollowUp }}</strong><span>待跟进</span>
          </div>
        </div>
        <div class="charts">
          <div class="chart funnel">
            <h3>投递漏斗</h3>
            <div v-for="entry in stats.funnel" :key="entry.stage" class="funnel-row">
              <span class="funnel-label">{{ entry.label }}</span>
              <span class="funnel-bar" :style="{ width: `${(entry.count / maxFunnel) * 100}%` }" />
              <span class="funnel-count">{{ entry.count }}</span>
            </div>
          </div>
          <div class="chart weekly">
            <h3>近 7 天投递</h3>
            <div class="weekly-bars" role="img" :aria-label="`近七天投递：${stats.weekly.map((entry) => `${entry.weekday} ${entry.count} 份`).join('，')}`">
              <div v-for="entry in stats.weekly" :key="entry.dateKey" class="weekly-col">
                <span class="weekly-bar" :style="{ height: `${(entry.count / maxWeekly) * 100}%` }" />
                <small>{{ entry.weekday }}</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-if="dueReminders.length" aria-label="到期提醒">
        <h2>到期的提醒</h2>
        <ul class="due-list">
          <li v-for="{ reminder, item } in dueReminders" :key="reminder.id">
            <button type="button" @click="emit('open-application', { id: item.id })">
              {{ reminder.title }} · {{ item.companyName }}
            </button>
          </li>
        </ul>
      </section>
    </template>
  </template>
</template>
<style scoped>
h2{margin:26px 0 12px;font-size:17px}
.expiring-banner{padding:14px 18px;border-radius:12px;background:color-mix(in srgb,#f79009 12%,transparent)}
.expiring-banner h2{margin:0 0 8px;font-size:15px}
.expiring-banner ul{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.expiring-banner button{padding:5px 12px;border:0;border-radius:8px;font-weight:600;background:var(--cl-surface)}
.expiring-banner .urgent button{color:#b42318;background:color-mix(in srgb,#f04438 14%,var(--cl-surface))}
.suggestions{display:grid;gap:10px;margin:0;padding:0;list-style:none}
.suggestion-card{padding:14px 18px;border:1px solid var(--cl-border);border-radius:11px;background:var(--cl-surface)}
.suggestion-card p{margin:0 0 10px}
.actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.dismiss{margin-left:auto;border:0;color:var(--cl-muted);background:transparent;font-size:12px;text-decoration:underline}
.drop-warning{color:var(--cl-muted);font-size:12px}
.all-clear,.more-suggestions{color:var(--cl-muted);font-size:13px}
.stats-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.stat-card{display:grid;gap:2px;padding:16px;border-radius:11px;background:var(--cl-surface);text-align:center}
.stat-card strong{font-size:26px;color:var(--cl-text-strong)}
.stat-card span{color:var(--cl-muted);font-size:12px}
.charts{display:grid;grid-template-columns:1.4fr 1fr;gap:12px;margin-top:12px}
.chart{padding:16px;border-radius:11px;background:var(--cl-surface)}
.chart h3{margin:0 0 12px;font-size:14px}
.funnel-row{display:grid;grid-template-columns:64px 1fr 26px;gap:8px;align-items:center;margin-bottom:6px}
.funnel-label{color:var(--cl-muted);font-size:12px}
.funnel-bar{height:10px;border-radius:5px;background:var(--cl-primary)}
.funnel-count{color:var(--cl-muted);font-size:12px;text-align:right}
.weekly-bars{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;height:120px}
.weekly-col{display:grid;grid-template-rows:1fr auto;gap:6px;align-items:end;text-align:center}
.weekly-bar{width:100%;min-height:4px;border-radius:4px 4px 0 0;background:var(--cl-primary)}
.weekly-col small{color:var(--cl-muted);font-size:11px}
.due-list{margin:0;padding:0;list-style:none}
.due-list button{padding:8px 14px;border:1px solid var(--cl-border);border-radius:9px;background:var(--cl-surface)}
@media(max-width:760px){.charts{grid-template-columns:1fr}.stats-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
</style>
```

注意点：
- `pendingDropId` 判断用 `suggestion.actions.find(...)` 的 `applicationId`；类型收窄写法如上（`as { applicationId: string } | undefined`）。
- 收藏列表一次拉 `pageSize: 100`（Mock 场景职位总数 < 100）。

- [ ] **Step 2: Run typecheck and existing tests**

Run: `pnpm --filter @career-launch/web typecheck && pnpm --filter @career-launch/web test`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/applications/TodayFocus.vue
git commit -m "feat: add today focus view with suggestions and stats"
```

---

### Task 12: 日历视图（CalendarView）

**Files:**
- Create: `apps/web/src/features/applications/CalendarView.vue`

**Interfaces:**
- Consumes: Task 5 `buildCalendar`/`CalendarEvent`；Task 1 `admin.seasons.list`（学生端无独立 seasons 接口，复用 admin 契约里的只读列表——Mock 无鉴权，且阶段 B 后端会补鉴权）
- Produces:

```ts
props: { applications: Application[] }
emits: { 'open-application': [payload: { id: string; focusNote?: boolean }] }
```

**验证方式：** typecheck + 现有测试 + Task 15 手动验收（月格与事件归属已在 Task 5 单测覆盖）。
**窄屏降级：** 通过 CSS 在 <650px 隐藏事件文字、只显示色点 + 下方当日事件面板始终可用（比完整周视图实现更稳，验收口径“无遮挡”不变）。

- [ ] **Step 1: Write the implementation**

`apps/web/src/features/applications/CalendarView.vue`：

```vue
<script setup lang="ts">
import type { RecruitmentSeason } from '@career-launch/shared'
import { computed, onMounted, ref } from 'vue'
import { repository } from '../../services/repository'
import { buildCalendar, type CalendarCell } from './calendar'

const props = defineProps<{ applications: Application[] }>()
const emit = defineEmits<{ 'open-application': [payload: { id: string; focusNote?: boolean }] }>()

const now = new Date()
const year = ref(now.getFullYear())
const month = ref(now.getMonth())
const seasons = ref<RecruitmentSeason[]>([])
const selectedDateKey = ref<string | null>(null)

onMounted(async () => {
  seasons.value = await repository.admin.seasons.list()
})

const cells = computed<CalendarCell[]>(() => buildCalendar(props.applications, seasons.value, year.value, month.value, now))

const monthLabel = computed(() => `${year.value} 年 ${month.value + 1} 月`)

const selectedCell = computed(() => cells.value.find((cell) => cell.dateKey === selectedDateKey.value) ?? null)

const hasEvents = (cell: CalendarCell) => cell.events.length > 0

function shiftMonth(delta: number) {
  const next = new Date(year.value, month.value + delta, 1)
  year.value = next.getFullYear()
  month.value = next.getMonth()
  selectedDateKey.value = null
}

function goToday() {
  year.value = now.getFullYear()
  month.value = now.getMonth()
  selectedDateKey.value = null
}

const WEEKDAY_HEADERS = ['日', '一', '二', '三', '四', '五', '六']
</script>
<template>
  <div class="calendar-head">
    <h2>{{ monthLabel }}</h2>
    <div class="calendar-nav">
      <button class="cl-quiet-button" type="button" aria-label="上个月" @click="shiftMonth(-1)">‹</button>
      <button class="cl-quiet-button" type="button" @click="goToday">回到今天</button>
      <button class="cl-quiet-button" type="button" aria-label="下个月" @click="shiftMonth(1)">›</button>
    </div>
  </div>

  <div class="calendar-grid" role="grid" aria-label="投递日历">
    <span v-for="weekday in WEEKDAY_HEADERS" :key="weekday" class="weekday" role="columnheader">{{ weekday }}</span>
    <button
      v-for="cell in cells"
      :key="cell.dateKey"
      type="button"
      role="gridcell"
      class="day"
      :class="{ outside: !cell.inMonth, today: cell.isToday, selected: selectedDateKey === cell.dateKey }"
      :aria-label="`${cell.dateKey}${cell.events.length ? `，${cell.events.length} 个日程` : ''}`"
      @click="selectedDateKey = selectedDateKey === cell.dateKey ? null : cell.dateKey"
    >
      <span class="day-number">{{ cell.day }}</span>
      <span class="event-dots" aria-hidden="true">
        <i v-for="event in cell.events.slice(0, 3)" :key="event.kind + event.label" :class="event.tone" />
      </span>
      <span class="event-labels" aria-hidden="true">
        <em v-for="event in cell.events.slice(0, 2)" :key="event.kind + event.label" :class="event.tone">{{ event.label }}</em>
      </span>
    </button>
  </div>

  <section v-if="selectedCell" class="day-panel" :aria-label="`${selectedCell.dateKey} 的日程`">
    <h3>{{ selectedCell.dateKey }}</h3>
    <ul v-if="hasEvents(selectedCell)">
      <li v-for="event in selectedCell.events" :key="event.kind + event.label" :class="event.tone">
        <span class="event-kind">{{ { deadline: '截止', reminder: '提醒', season_start: '开始', season_end: '结束' }[event.kind] }}</span>
        <span>{{ event.label }}</span>
        <button
          v-if="event.applicationId"
          class="cl-quiet-button"
          type="button"
          @click="emit('open-application', { id: event.applicationId! })"
        >查看投递</button>
      </li>
    </ul>
    <p v-else>这天没有安排。点击其他日期查看日程。</p>
  </section>
  <p v-else class="day-panel-hint">点击有圆点的日期查看当天安排。</p>
</template>
<style scoped>
.calendar-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.calendar-head h2{margin:0;font-size:18px}
.calendar-nav{display:flex;gap:6px}
.calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
.weekday{padding:6px 0;text-align:center;color:var(--cl-muted);font-size:12px;font-weight:600}
.day{display:grid;grid-template-rows:auto auto 1fr;gap:4px;min-height:86px;padding:8px;border:1px solid var(--cl-border);border-radius:9px;background:var(--cl-surface);text-align:left}
.day.outside{opacity:.45}
.day.today{border-color:var(--cl-primary)}
.day.selected{outline:2px solid var(--cl-primary);outline-offset:1px}
.day-number{font-size:13px;font-weight:600}
.event-dots{display:flex;gap:3px}
.event-dots i{width:6px;height:6px;border-radius:50%}
.event-dots i,.event-labels em{display:inline-block}
.event-labels{display:grid;gap:2px}
.event-labels em{overflow:hidden;padding:1px 5px;border-radius:5px;font-size:10px;font-style:normal;text-overflow:ellipsis;white-space:nowrap}
i.danger,em.danger{background:color-mix(in srgb,#f04438 16%,transparent);color:#b42318}
i.warning,em.warning{background:color-mix(in srgb,#f79009 18%,transparent);color:#b54708}
i.primary,em.primary{background:var(--cl-primary-soft);color:var(--cl-primary)}
i.neutral,em.neutral{background:var(--cl-border);color:var(--cl-muted)}
.day-panel{margin-top:16px;padding:16px 18px;border-radius:11px;background:var(--cl-surface)}
.day-panel h3{margin:0 0 10px;font-size:14px}
.day-panel ul{display:grid;gap:8px;margin:0;padding:0;list-style:none}
.day-panel li{display:flex;align-items:center;gap:10px;font-size:13px}
.day-panel li.danger{color:#b42318}
.day-panel li.warning{color:#b54708}
.event-kind{padding:1px 8px;border-radius:6px;background:var(--cl-border);color:var(--cl-muted);font-size:11px}
.day-panel-hint{margin-top:14px;color:var(--cl-muted);font-size:13px}
@media(max-width:650px){.day{min-height:52px}.event-labels{display:none}}
</style>
```

- [ ] **Step 2: Run typecheck and existing tests**

Run: `pnpm --filter @career-launch/web typecheck && pnpm --filter @career-launch/web test`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/applications/CalendarView.vue
git commit -m "feat: add workspace calendar view"
```

---

### Task 13: 工作台外壳与路由迁移（WorkspacePage）

**Files:**
- Create: `apps/web/src/features/applications/WorkspacePage.vue`
- Modify: `apps/web/src/router.ts`（`applications` 路由 → `workspace` + 旧路由重定向）
- Modify: `apps/web/src/layouts/PublicLayout.vue`（导航文案与链接）
- Delete: `apps/web/src/features/applications/ApplicationsPage.vue`

**Interfaces:**
- Consumes: Task 8/9/10/11/12 的组件（`open-application` payload `{ id: string; focusNote?: boolean }`）
- Produces: `provide('reloadApplications', load)`；路由 `/me/workspace?view=today|board|list|calendar`；`/me/applications` 重定向。

- [ ] **Step 1: Write the implementation**

`apps/web/src/features/applications/WorkspacePage.vue`：

```vue
<script setup lang="ts">
import type { Application } from '@career-launch/shared'
import { SkeletonCard } from '@career-launch/ui'
import { computed, onMounted, provide, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { repository } from '../../services/repository'
import ApplicationDrawer from './ApplicationDrawer.vue'
import ApplicationsBoard from './ApplicationsBoard.vue'
import ApplicationsList from './ApplicationsList.vue'
import CalendarView from './CalendarView.vue'
import TodayFocus from './TodayFocus.vue'

const TABS = [
  { key: 'today', label: '今日聚焦' },
  { key: 'board', label: '看板' },
  { key: 'list', label: '列表' },
  { key: 'calendar', label: '日历' },
] as const
type TabKey = (typeof TABS)[number]['key']

const route = useRoute()
const router = useRouter()
const applications = ref<Application[]>([])
const loading = ref(false)
const drawerId = ref<string | null>(null)
const drawerFocusNote = ref(false)

const tab = computed<TabKey>(() => {
  const value = route.query.view
  return TABS.some((entry) => entry.key === value) ? (value as TabKey) : 'today'
})

const drawerApplication = computed(() => applications.value.find((item) => item.id === drawerId.value) ?? null)

function selectTab(key: TabKey) {
  const query = { ...route.query }
  if (key === 'today') delete query.view
  else query.view = key
  router.replace({ query })
}

async function load() {
  loading.value = true
  applications.value = await repository.applications.list()
  loading.value = false
}

function openApplication(payload: { id: string; focusNote?: boolean }) {
  drawerId.value = payload.id
  drawerFocusNote.value = payload.focusNote ?? false
}

provide('reloadApplications', load)
onMounted(load)
</script>
<template>
  <section>
    <header class="page-head">
      <div>
        <h1>求职工作台</h1>
        <p>把每一次申请放在正确阶段，下一步会更清楚。</p>
      </div>
    </header>

    <div class="view-toggle" role="tablist" aria-label="工作台视图">
      <button
        v-for="entry in TABS"
        :key="entry.key"
        type="button"
        role="tab"
        :aria-selected="tab === entry.key"
        :aria-pressed="tab === entry.key"
        @click="selectTab(entry.key)"
      >{{ entry.label }}</button>
    </div>

    <div v-if="tab === 'today'" class="today-wrap">
      <SkeletonCard v-if="loading" :lines="6" label="正在加载工作台" />
      <TodayFocus v-else :applications="applications" :loading="loading" @open-application="openApplication" />
    </div>
    <ApplicationsBoard v-else-if="tab === 'board'" :applications="applications" @open-application="openApplication" />
    <ApplicationsList v-else-if="tab === 'list'" :applications="applications" @open-application="openApplication" />
    <CalendarView v-else :applications="applications" @open-application="openApplication" />

    <ApplicationDrawer :application="drawerApplication" :focus-note="drawerFocusNote" @close="drawerId = null" />
  </section>
</template>
<style scoped>
.page-head h1{margin:0;font-size:30px}
.page-head p{color:var(--cl-muted)}
.view-toggle{display:flex;align-self:start;padding:3px;margin:18px 0;border-radius:8px;background:var(--cl-border)}
.view-toggle button{padding:6px 13px;border:0;border-radius:6px;color:var(--cl-muted);background:transparent}
.view-toggle button[aria-pressed=true]{color:var(--cl-text);background:var(--cl-surface)}
</style>
```

- [ ] **Step 2: Migrate the route and navigation**

`apps/web/src/router.ts`：把 `/me` children 中的

```
{path:'applications',component:()=>import('./features/applications/ApplicationsPage.vue')}
```

替换为（保持该文件单行压缩风格）：

```
{path:'applications',redirect:{name:'workspace'}},{path:'workspace',name:'workspace',component:()=>import('./features/applications/WorkspacePage.vue')}
```

`apps/web/src/layouts/PublicLayout.vue`：导航里的

```
<RouterLink to="/me/applications">投递看板</RouterLink>
```

改为：

```
<RouterLink to="/me/workspace">求职工作台</RouterLink>
```

删除 `apps/web/src/features/applications/ApplicationsPage.vue`：

```bash
git rm apps/web/src/features/applications/ApplicationsPage.vue
```

同时全局搜索确认没有残留引用：

```bash
grep -rn "ApplicationsPage" apps/web/src packages || echo "clean"
```

- [ ] **Step 3: Run typecheck, tests and a manual smoke check**

Run: `pnpm --filter @career-launch/web typecheck && pnpm --filter @career-launch/web test`
Expected: PASS。

手动冒烟（可选但推荐）：`pnpm dev:web`，登录（`student@example.com` / `246810`），访问 `/me/applications` 应重定向到 `/me/workspace`，四个 Tab 可切换且刷新后视图保留。

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/applications/WorkspacePage.vue apps/web/src/router.ts apps/web/src/layouts/PublicLayout.vue
git commit -m "feat: assemble job workspace page and migrate routes"
```

---

### Task 14: 职位对比 UI（JobCard 勾选 + 对比托盘与抽屉）

**Files:**
- Create: `apps/web/src/features/jobs/JobCompare.vue`
- Modify: `apps/web/src/features/jobs/JobCard.vue`
- Modify: `apps/web/src/features/jobs/JobsPage.vue`

**Interfaces:**
- Consumes: Task 6 `buildCompareRows`/`MAX_COMPARE`
- Produces:

```ts
// JobCard 新增
props: { job: Job; compareSelected?: boolean; compareDisabled?: boolean }
emits: { 'toggle-compare': [] }（原有 props 保留）

// JobCompare
props: { jobs: Job[] }
emits: { remove: [id: string]; clear: [] }
```

**验证方式：** typecheck + 现有测试 + Task 15 手动验收（对比行构建已在 Task 6 单测覆盖）。

- [ ] **Step 1: Write JobCompare.vue**

`apps/web/src/features/jobs/JobCompare.vue`：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { buildCompareRows } from './compare'

const props = defineProps<{ jobs: Job[] }>()
const emit = defineEmits<{ remove: [id: string]; clear: [] }>()
const open = ref(false)

const rows = computed(() => buildCompareRows(props.jobs))
</script>
<template>
  <div class="compare-tray" role="region" aria-label="职位对比">
    <span>已选 {{ jobs.length }}/{{ 3 }} 个职位</span>
    <ul>
      <li v-for="job in jobs" :key="job.id">
        {{ job.title }}
        <button type="button" :aria-label="`移出对比：${job.title}`" @click="emit('remove', job.id)">×</button>
      </li>
    </ul>
    <button class="cl-quiet-button" type="button" @click="emit('clear')">清空</button>
    <button class="cl-primary-button" type="button" :disabled="jobs.length < 2" @click="open = true">
      {{ jobs.length < 2 ? '再选一个就能对比' : '开始对比' }}
    </button>
  </div>

  <div v-if="open" class="compare-layer" @mousedown.self="open = false">
    <aside class="compare-drawer" role="dialog" aria-modal="true" aria-label="职位对比">
      <button class="close" type="button" aria-label="关闭对比" @click="open = false">×</button>
      <h2>职位对比</h2>
      <p class="hint">差异字段已高亮，相同字段说明这几份工作在这点上打平。</p>
      <div class="compare-table-wrap">
        <table class="compare-table">
          <thead>
            <tr>
              <th scope="col">维度</th>
              <th v-for="job in jobs" :key="job.id" scope="col">
                <RouterLink :to="`/jobs/${job.id}`">{{ job.title }}</RouterLink>
                <small>{{ job.companyName }}</small>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.label" :class="{ differs: row.differs }">
              <th scope="row">{{ row.label }}</th>
              <td v-for="(value, index) in row.values" :key="index">{{ value }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </aside>
  </div>
</template>
<style scoped>
.compare-tray{position:fixed;z-index:70;bottom:0;left:50%;transform:translateX(-50%);display:flex;flex-wrap:wrap;align-items:center;gap:12px;max-width:min(92vw,760px);padding:12px 18px;border:1px solid var(--cl-border);border-bottom:0;border-radius:12px 12px 0 0;background:var(--cl-surface);box-shadow:var(--cl-shadow-float)}
.compare-tray>span{color:var(--cl-muted);font-size:12px;white-space:nowrap}
.compare-tray ul{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}
.compare-tray li{display:flex;align-items:center;gap:4px;padding:4px 10px;border-radius:8px;background:var(--cl-primary-soft);font-size:12px}
.compare-tray li button{border:0;background:transparent;color:var(--cl-muted)}
.compare-layer{position:fixed;z-index:80;inset:0;background:rgba(8,15,29,.45)}
.compare-drawer{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(96vw,860px);max-height:86vh;overflow:auto;padding:26px;background:var(--cl-surface);border-radius:14px}
.close{position:absolute;top:14px;right:14px;width:36px;height:36px;border:0;border-radius:50%;background:var(--cl-canvas);font-size:22px}
h2{margin:0 0 4px}
.hint{margin:0 0 16px;color:var(--cl-muted);font-size:13px}
.compare-table-wrap{overflow-x:auto}
.compare-table{width:100%;border-collapse:collapse}
.compare-table th,.compare-table td{padding:10px 12px;border:1px solid var(--cl-border);text-align:left;vertical-align:top;font-size:13px}
.compare-table thead a{color:var(--cl-text-strong);font-weight:700}
.compare-table thead small{display:block;color:var(--cl-muted)}
.compare-table tbody th{color:var(--cl-muted);font-weight:600;white-space:nowrap}
.compare-table tr.differs td{background:var(--cl-primary-soft);font-weight:600}
</style>
```

- [ ] **Step 2: Add the compare toggle to JobCard**

`apps/web/src/features/jobs/JobCard.vue` 的 `<script setup>` 改为：

```vue
<script setup lang="ts">
import type { Job } from '@career-launch/shared'
import { formatDeadline } from '@career-launch/shared'
import { StatusBadge } from '@career-launch/ui'
defineProps<{ job: Job; compareSelected?: boolean; compareDisabled?: boolean }>()
defineEmits<{ 'toggle-compare': [] }>()
</script>
```

模板里 `<footer>` 之前插入对比勾选（放在 `job-meta` 之后）：

```html
<label class="compare-toggle">
  <input
    type="checkbox"
    :checked="compareSelected"
    :disabled="compareDisabled"
    @change="$emit('toggle-compare')"
  />
  对比
</label>
```

样式追加到 `<style scoped>`：

```css
.compare-toggle{display:inline-flex;align-items:center;gap:6px;color:var(--cl-muted);font-size:13px}
.compare-toggle input{accent-color:var(--cl-primary)}
```

- [ ] **Step 3: Wire JobsPage**

`apps/web/src/features/jobs/JobsPage.vue` 的 `<script setup>` 中：

import 区追加（该文件保持压缩风格）：

```
import JobCompare from './JobCompare.vue';import{MAX_COMPARE} from './compare'
```

`const keyword=...` 一行之后追加状态与处理函数：

```
const compareJobs=ref<Job[]>([]);function toggleCompare(job:Job){const found=compareJobs.value.find((entry)=>entry.id===job.id);if(found)compareJobs.value=compareJobs.value.filter((entry)=>entry.id!==job.id);else if(compareJobs.value.length<MAX_COMPARE)compareJobs.value=[...compareJobs.value,job]}function removeCompare(id:string){compareJobs.value=compareJobs.value.filter((entry)=>entry.id!==id)}function clearCompare(){compareJobs.value=[]}
```

模板中 `<JobCard ... />` 循环改为：

```html
<JobCard v-for="job in jobs" :key="job.id" :job="job" :compare-selected="compareJobs.some((entry)=>entry.id===job.id)" :compare-disabled="compareJobs.length>=MAX_COMPARE&&!compareJobs.some((entry)=>entry.id===job.id)" @toggle-compare="toggleCompare(job)"/>
```

`</main></div>` 之后、`</section>` 之前插入：

```html
<JobCompare v-if="compareJobs.length" :jobs="compareJobs" @remove="removeCompare" @clear="clearCompare"/>
```

- [ ] **Step 4: Run typecheck and existing tests**

Run: `pnpm --filter @career-launch/web typecheck && pnpm --filter @career-launch/web test`
Expected: PASS（含 JobFilters/HeroSearch 等既有测试）。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/jobs/JobCompare.vue apps/web/src/features/jobs/JobCard.vue apps/web/src/features/jobs/JobsPage.vue
git commit -m "feat: add side-by-side job comparison"
```

---

### Task 15: 全量验证与验收清单更新

**Files:**
- Modify: `docs/frontend-acceptance.md`（学生端小节追加工作台验收项）

- [ ] **Step 1: Run the whole suite**

Run:
```bash
pnpm -r --if-present test && pnpm -r --if-present typecheck && pnpm build
```
Expected: 全部 PASS，build 产出无 TypeScript 错误。

- [ ] **Step 2: Manual acceptance against the spec**

启动 `pnpm dev:web`（如需后台另开 `pnpm dev:admin`），登录演示账号，逐项核对 spec §9：

1. 打开 `/me/workspace` 默认落在“今日聚焦”，能看到建议卡片、临期条幅、统计、到期提醒（先在抽屉里设置一个过去时间的提醒再刷新验证通知生成）。
2. 四个 Tab 可切换，URL `?view=` 保留状态，直接粘贴 URL 也进入对应视图。
3. `/me/applications` 重定向到 `/me/workspace`；顶部导航显示“求职工作台”。
4. 抽屉里改备注 → 保存 → 重新打开仍在；设置提醒 → 到期出现在通知中心且不重复。
5. 看板卡片显示“停留 N 天”和临期角标；归档有二次确认；列表筛选“已归档”可恢复。
6. 日历上截止/提醒/招聘季事件落在正确日期，点击日期展开当日安排。
7. 职位列表勾选 2-3 个职位 → 对比抽屉 → 差异行高亮；第 4 个勾选被禁用。
8. 320px / 768px / 1024px / 1440px 无遮挡；键盘 Tab 可遍历主要控件。
9. 系统开启“减少动态效果”后骨架屏停止脉动。

发现问题回到对应任务修复后再进入下一步。

- [ ] **Step 3: Update the acceptance doc**

在 `docs/frontend-acceptance.md` 的“学生端”小节末尾追加：

```markdown
- 求职工作台默认显示“今日聚焦”：临期预警、建议行动（可不再提醒）、投递漏斗与近 7 天节奏统计、到期提醒。
- 工作台看板卡片显示停留天数与临期角标；卡片可归档（二次确认），列表支持筛选、排序与批量归档/恢复。
- 投递详情抽屉支持独立备注编辑与真实提醒：设置后持久化，到期转入通知中心且不重复。
- 日历视图按月展示投递截止、提醒与招聘季起止，点击日期查看当日安排。
- 职位列表可勾选 2-3 个职位并排对比，差异字段高亮，相同字段弱化。
- 旧地址 `/me/applications` 自动跳转到 `/me/workspace`，URL 保留当前视图。
```

- [ ] **Step 4: Commit**

```bash
git add docs/frontend-acceptance.md
git commit -m "docs: extend acceptance checklist for job workspace"
```

---

## Self-Review 结论（已完成）

- **Spec coverage**：spec §3（四 Tab、URL 参数、重定向）→ Task 13；§4（五种规则、dismiss、优先级、上限 5 条）→ Task 3/11；§3.2 统计 → Task 4/11；§3.3 看板卡片 → Task 9；§3.4 列表筛选/批量 → Task 10；§3.5 日历 → Task 5/12；§5 对比 → Task 6/14；§6 数据层与迁移 → Task 1；§7 人性化 → 各 UI 任务（骨架屏 Task 7、二次确认 Task 8/9/10/11、reduced-motion Task 7）；§8 测试 → 各任务 Step 1；§9 验收 → Task 15。无遗漏。
- **Placeholder scan**：无 TBD/TODO；所有代码块完整。
- **Type consistency**：`open-application` payload `{ id: string; focusNote?: boolean }` 在 Task 8/9/10/11/12/13 一致；`formatDeadlineStatus`/`daysUntil`/`shanghaiDateKey` 签名与 Task 3/4/5/9/10/11/12 的调用一致；`buildSuggestions` 签名与 Task 11 调用一致。
- **已知偏差（有意为之）**：日历窄屏降级为“色点 + 当日面板”而非完整周视图（Task 12 注明）；对比选择不跨分页保留（spec 明确不持久化）。

