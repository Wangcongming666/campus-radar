import type {
  Application,
  ApplicationStage,
  Article,
  Company,
  ContentQuery,
  Job,
  JobQuery,
  ListQuery,
  Notification,
  Page,
  Question,
  RecruitmentSeason,
  Reminder,
  Resume,
  User,
} from '@career-launch/shared'

import { ApiError, type CareerRepository } from '../contracts'
import { articles as seedArticles, companies as seedCompanies, jobs as seedJobs, notifications as seedNotifications, operators as seedOperators, questions as seedQuestions, resumes as seedResumes, seasons as seedSeasons, student } from './fixtures'

export interface MockRepositoryOptions {
  storage?: 'memory' | 'indexeddb'
  latencyMs?: number
  includeDemoApplications?: boolean
}

interface State {
  companies: Company[]
  jobs: Job[]
  seasons: RecruitmentSeason[]
  articles: Article[]
  questions: Question[]
  applications: Application[]
  resumes: Resume[]
  notifications: Notification[]
  users: User[]
  operators: User[]
  currentUser: User | null
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function initialState(includeDemoApplications = false): State {
  const demoStages: ApplicationStage[] = ['pending_confirmation', 'applied', 'written_test', 'interview', 'offer', 'rejected']
  const demoApplications: Application[] = includeDemoApplications ? seedJobs.slice(0, 6).map((job, index) => {
    const stage = demoStages[index] ?? 'applied'
    const occurredAt = new Date(Date.UTC(2026, 8, 14 + index)).toISOString()
    return { id: `application-${String(index + 1).padStart(3, '0')}`, userId: student.id, jobId: job.id, jobTitle: job.title, companyName: job.companyName, companyLogoText: job.companyLogoText, city: job.city, deadlineAt: job.deadlineAt, stage, ...(stage === 'pending_confirmation' ? {} : { appliedAt: occurredAt }), note: index === 3 ? '准备系统设计与项目复盘' : '', archived: false, events: [{ id: `application-event-${index + 1}`, toStage: stage, occurredAt }], reminders: [], updatedAt: occurredAt }
  }) : []
  return clone({
    companies: seedCompanies,
    jobs: seedJobs,
    seasons: seedSeasons,
    articles: seedArticles,
    questions: seedQuestions,
    applications: demoApplications,
    resumes: seedResumes,
    notifications: seedNotifications,
    users: [student],
    operators: seedOperators,
    currentUser: null,
  })
}

function paginate<T>(items: T[], page: number, pageSize: number): Page<T> {
  const start = (page - 1) * pageSize
  return { items: items.slice(start, start + pageSize), page, pageSize, total: items.length }
}

function includesKeyword(values: string[], keyword?: string): boolean {
  if (!keyword) return true
  const normalized = keyword.trim().toLocaleLowerCase('zh-CN')
  return values.some((value) => value.toLocaleLowerCase('zh-CN').includes(normalized))
}

const STORAGE_KEY = 'career-launch-mock-v2'
const LEGACY_KEY = 'career-launch-mock-v1'

const STATE_COLLECTIONS = ['companies', 'jobs', 'seasons', 'articles', 'questions', 'applications', 'resumes', 'notifications', 'users', 'operators'] as const

function isStateShape(value: unknown): value is State {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<Record<keyof State, unknown>>
  return STATE_COLLECTIONS.every((key) => Array.isArray(candidate[key])) && 'currentUser' in candidate
}

function createStateStore(storage: MockRepositoryOptions['storage'], includeDemoApplications: boolean) {
  let memory = initialState(includeDemoApplications)

  if (storage === 'indexeddb' && typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY)
    if (saved) {
      try {
        const parsed: unknown = JSON.parse(saved)
        memory = isStateShape(parsed) ? parsed : initialState(includeDemoApplications)
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

export function createMockRepository(options: MockRepositoryOptions = {}): CareerRepository {
  const latencyMs = options.latencyMs ?? 180
  const storage = options.storage ?? 'indexeddb'
  const store = createStateStore(storage, options.includeDemoApplications ?? storage !== 'memory')
  const delay = async () => {
    if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs))
  }
  const state = () => store.get()

  const listJobs = async (query: JobQuery, includeInactive = false): Promise<Page<Job>> => {
    await delay()
    let items = state().jobs.filter((job) => includeInactive || job.status === 'active')
    items = items.filter((job) => includesKeyword([job.title, job.companyName, ...job.city, ...job.majors], query.keyword))
    if (query.city.length) items = items.filter((job) => query.city.some((city) => job.city.includes(city)))
    if (query.category.length) items = items.filter((job) => query.category.includes(job.category))
    if (query.education.length) items = items.filter((job) => query.education.some((level) => job.education.includes(level as Job['education'][number])))
    if (query.seasonId) items = items.filter((job) => job.seasonId === query.seasonId)
    if (query.favorite) items = items.filter((job) => job.favorite)
    items.sort((a, b) => query.sort === 'deadline' ? a.deadlineAt.localeCompare(b.deadlineAt) : b.publishedAt.localeCompare(a.publishedAt))
    return paginate(clone(items), query.page, query.pageSize)
  }

  const repository: CareerRepository = {
    auth: {
      async requestCode(email) {
        await delay()
        if (!/^\S+@\S+\.\S+$/.test(email)) throw new ApiError('INVALID_EMAIL', '请输入有效邮箱', { email: '请输入有效邮箱' })
        return { expiresIn: 60 }
      },
      async verifyCode(email, code) {
        await delay()
        if (code !== '246810') throw new ApiError('INVALID_VERIFICATION_CODE', '验证码错误或已失效')
        const user = email === student.email ? student : { ...student, id: crypto.randomUUID(), email, nickname: email.split('@')[0] || '新同学' }
        state().currentUser = clone(user)
        store.save()
        return clone(user)
      },
      async currentUser() { await delay(); return clone(state().currentUser) },
      async logout() { await delay(); state().currentUser = null; store.save() },
    },
    jobs: {
      list: (query) => listJobs(query),
      async get(id) {
        await delay()
        const job = state().jobs.find((item) => item.id === id)
        if (!job) throw new ApiError('JOB_NOT_FOUND', '职位不存在或已被删除')
        return clone(job)
      },
      async favorite(id, value) {
        await delay()
        const job = state().jobs.find((item) => item.id === id)
        if (!job) throw new ApiError('JOB_NOT_FOUND', '职位不存在或已被删除')
        job.favorite = value
        store.save()
      },
    },
    companies: {
      async list(query) {
        await delay()
        const items = state().companies.filter((company) => company.status === 'active' && includesKeyword([company.name, company.industry, ...company.cities], query.keyword))
        return paginate(clone(items), query.page, query.pageSize)
      },
      async get(id) {
        await delay()
        const company = state().companies.find((item) => item.id === id)
        if (!company) throw new ApiError('COMPANY_NOT_FOUND', '公司不存在或已停用')
        return clone(company)
      },
    },
    knowledge: {
      async listArticles(query) {
        await delay()
        const items = state().articles.filter((item) => includesKeyword([item.title, item.summary, ...item.tags], query.keyword) && (!query.category || item.category === query.category))
        return paginate(clone(items), query.page, query.pageSize)
      },
      async getArticle(id) {
        await delay()
        const article = state().articles.find((item) => item.id === id)
        if (!article) throw new ApiError('ARTICLE_NOT_FOUND', '内容不存在或已下线')
        return clone(article)
      },
      async listQuestions(query) {
        await delay()
        const items = state().questions.filter((item) => includesKeyword([item.prompt, item.category, ...item.tags], query.keyword) && (!query.category || item.category === query.category) && (!query.stage || item.stage === query.stage) && (!query.difficulty || item.difficulty === query.difficulty))
        return paginate(clone(items), query.page, query.pageSize)
      },
    },
    applications: {
      async list() { await delay(); return clone(state().applications) },
      async start(jobId) {
        await delay()
        const existing = state().applications.find((item) => item.jobId === jobId && !item.archived)
        if (existing) return clone(existing)
        const job = state().jobs.find((item) => item.id === jobId)
        if (!job) throw new ApiError('JOB_NOT_FOUND', '职位不存在或已被删除')
        const now = new Date().toISOString()
        const application: Application = {
          id: crypto.randomUUID(), userId: student.id, jobId: job.id, jobTitle: job.title, companyName: job.companyName,
          companyLogoText: job.companyLogoText, city: job.city, deadlineAt: job.deadlineAt, stage: 'pending_confirmation', note: '', archived: false,
          events: [{ id: crypto.randomUUID(), toStage: 'pending_confirmation', occurredAt: now }], reminders: [], updatedAt: now,
        }
        state().applications.push(application)
        store.save()
        return clone(application)
      },
      async updateStage(id, stage: ApplicationStage, note) {
        await delay()
        const application = state().applications.find((item) => item.id === id)
        if (!application) throw new ApiError('APPLICATION_NOT_FOUND', '投递记录不存在')
        const previous = application.stage
        application.stage = stage
        application.updatedAt = new Date().toISOString()
        application.events.push({ id: crypto.randomUUID(), fromStage: previous, toStage: stage, ...(note ? { note } : {}), occurredAt: application.updatedAt })
        store.save()
        return clone(application)
      },
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
    },
    resumes: {
      async list() { await delay(); return clone(state().resumes) },
      async get(id) {
        await delay()
        const resume = state().resumes.find((item) => item.id === id)
        if (!resume) throw new ApiError('RESUME_NOT_FOUND', '简历不存在')
        return clone(resume)
      },
      async save(value) {
        await delay()
        const saved = { ...clone(value), updatedAt: new Date().toISOString(), version: value.version + 1 }
        const index = state().resumes.findIndex((item) => item.id === value.id)
        if (index >= 0) state().resumes[index] = saved
        else state().resumes.push(saved)
        store.save()
        return clone(saved)
      },
      async remove(id) { await delay(); state().resumes = state().resumes.filter((item) => item.id !== id); store.save() },
    },
    notifications: {
      async list() { await delay(); return clone(state().notifications) },
      async markRead(id) { await delay(); const item = state().notifications.find((entry) => entry.id === id); if (item) item.read = true; store.save() },
      async markAllRead() { await delay(); state().notifications.forEach((item) => { item.read = true }); store.save() },
    },
    admin: {
      async dashboard() {
        await delay()
        return { companies: state().companies.length, activeJobs: state().jobs.filter((job) => job.status === 'active').length, expiringJobs: state().jobs.filter((job) => job.status === 'active').slice(0, 8).length, publishedArticles: state().articles.length }
      },
      companies: {
        async list(query) { await delay(); return paginate(clone(state().companies.filter((item) => includesKeyword([item.name], query.keyword))), query.page, query.pageSize) },
        async save(company) { await delay(); const index = state().companies.findIndex((item) => item.id === company.id); if (index >= 0) state().companies[index] = clone(company); else state().companies.push(clone(company)); store.save(); return clone(company) },
        async updateStatus(id, status) { await delay(); const company = state().companies.find((item) => item.id === id); if (company) company.status = status; store.save() },
      },
      jobs: {
        list: (query) => listJobs(query, true),
        async save(job) { await delay(); const index = state().jobs.findIndex((item) => item.id === job.id); if (index >= 0) state().jobs[index] = clone(job); else state().jobs.push(clone(job)); store.save(); return clone(job) },
        async updateStatus(id, status) { await delay(); const job = state().jobs.find((item) => item.id === id); if (job) job.status = status; store.save() },
      },
      seasons: {
        async list() { await delay(); return clone(state().seasons) },
        async save(season) { await delay(); const index = state().seasons.findIndex((item) => item.id === season.id); if (index >= 0) state().seasons[index] = clone(season); else state().seasons.push(clone(season)); store.save(); return clone(season) },
      },
      articles: {
        async list(query) { return repository.knowledge.listArticles(query) },
        async save(article) { await delay(); const index = state().articles.findIndex((item) => item.id === article.id); if (index >= 0) state().articles[index] = clone(article); else state().articles.push(clone(article)); store.save(); return clone(article) },
      },
      questions: {
        async list(query) { return repository.knowledge.listQuestions(query) },
        async save(question) { await delay(); const index = state().questions.findIndex((item) => item.id === question.id); if (index >= 0) state().questions[index] = clone(question); else state().questions.push(clone(question)); store.save(); return clone(question) },
      },
      users: {
        async list(query) { await delay(); return paginate(clone(state().users.filter((item) => includesKeyword([item.nickname, item.email, item.school], query.keyword))), query.page, query.pageSize) },
        async updateStatus(id, status) { await delay(); const user = state().users.find((item) => item.id === id); if (user) user.status = status; store.save() },
      },
      operators: {
        async list() { await delay(); return clone(state().operators) },
        async save(operator) { await delay(); const index = state().operators.findIndex((item) => item.id === operator.id); if (index >= 0) state().operators[index] = clone(operator); else state().operators.push(clone(operator)); store.save(); return clone(operator) },
      },
    },
    async reset() { await delay(); store.reset() },
  }

  return repository
}
