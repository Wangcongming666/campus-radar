# Career Launch Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete, responsive, mock-backed Vue frontend for the “启程校招” student site and operations console, ready for user acceptance before Spring Boot development.

**Architecture:** Use a pnpm workspace with two Vue applications and three focused shared packages. Pages consume only a typed repository interface; the initial IndexedDB-backed mock adapter implements that interface so the future HTTP adapter can replace it without page rewrites.

**Tech Stack:** Vue 3, TypeScript, Vite, Vue Router, Pinia, Element Plus, Dexie, Zod, Vitest, Vue Test Utils, pnpm

**Spec:** `docs/superpowers/specs/2026-09-20-career-launch-design.md`

## Global Constraints

- Student site and operations console are separate Vue applications in one pnpm workspace.
- Brand name is “启程校招”; package and application identifiers use `career-launch`.
- Visual direction is “可信高效”: restrained blue accent, readable hierarchy, and medium-high information density.
- Public browsing works without authentication; favorites, resumes, applications, reminders, and profile require the mock session.
- Pages access data only through `@career-launch/api-client`; they never import fixture JSON or Dexie directly.
- Search filters and pagination are serialized to URL query parameters.
- Desktop prioritizes comparison, editing, and tables; widths down to 320px preserve every primary action.
- TypeScript strict mode, lint, unit tests, and production builds must pass before acceptance.
- The first frontend delivery does not call a real email, database, object store, or Spring Boot service.

---

## File Map

- `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`: workspace scripts and shared compiler settings.
- `packages/shared/src/domain.ts`: canonical entities, enums, paging types, and form shapes.
- `packages/shared/src/format.ts`: dates, deadlines, salary, and query helpers.
- `packages/api-client/src/contracts.ts`: `CareerRepository` interface and API error type.
- `packages/api-client/src/mock/`: fixtures, Dexie persistence, seed/reset, and repository implementation.
- `packages/ui/src/`: product tokens and reusable display, feedback, and navigation components.
- `apps/web/src/`: student routes, layouts, feature pages, stores, and components.
- `apps/admin/src/`: admin routes, layout, permission gates, and management pages.

---

### Task 1: Workspace Foundation and Shared Domain

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `packages/shared/package.json`
- Create: `packages/shared/src/domain.ts`
- Create: `packages/shared/src/format.ts`
- Test: `packages/shared/src/format.test.ts`

**Interfaces:**
- Produces: `Job`, `Company`, `Article`, `Question`, `Application`, `Resume`, `User`, `RecruitmentSeason`, `Page<T>`, `JobQuery`, `ApplicationStage`.
- Produces: `formatDeadline(date: string, now?: Date): string`, `parseJobQuery(input: URLSearchParams): JobQuery`, `serializeJobQuery(query: JobQuery): URLSearchParams`.

- [ ] **Step 1: Create workspace manifests and a failing formatter test**

```ts
import { describe, expect, it } from 'vitest'
import { formatDeadline } from './format'

describe('formatDeadline', () => {
  it('shows remaining days in Shanghai calendar days', () => {
    expect(formatDeadline('2026-09-23T15:59:59Z', new Date('2026-09-20T04:00:00Z'))).toBe('4天后截止')
  })
  it('marks a passed deadline as expired', () => {
    expect(formatDeadline('2026-09-19T15:59:59Z', new Date('2026-09-20T04:00:00Z'))).toBe('已截止')
  })
})
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `pnpm --filter @career-launch/shared test`

Expected: FAIL because `format.ts` and the exported function do not exist.

- [ ] **Step 3: Define domain types and implement date/query utilities**

```ts
export type ApplicationStage = 'pending_confirmation' | 'applied' | 'written_test' | 'interview' | 'offer' | 'rejected' | 'closed'

export interface Page<T> { items: T[]; page: number; pageSize: number; total: number }
export interface JobQuery { keyword?: string; city?: string[]; category?: string[]; education?: string[]; seasonId?: string; sort: 'latest' | 'deadline'; page: number; pageSize: number }

export function formatDeadline(value: string, now = new Date()): string {
  const day = 86_400_000
  const remaining = Math.ceil((new Date(value).getTime() - now.getTime()) / day)
  return remaining < 0 ? '已截止' : remaining === 0 ? '今天截止' : `${remaining}天后截止`
}
```

Define all listed entities with explicit string IDs, ISO date strings, and no `any` fields. Query parsing must apply defaults `sort='latest'`, `page=1`, and `pageSize=12`.

- [ ] **Step 4: Run shared tests and type checking**

Run: `pnpm --filter @career-launch/shared test && pnpm --filter @career-launch/shared typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the workspace foundation**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore packages/shared
git commit -m "chore: establish frontend workspace and domain types"
```

---

### Task 2: Typed Mock Repository and Seed Data

**Files:**
- Create: `packages/api-client/package.json`
- Create: `packages/api-client/src/contracts.ts`
- Create: `packages/api-client/src/index.ts`
- Create: `packages/api-client/src/mock/database.ts`
- Create: `packages/api-client/src/mock/fixtures.ts`
- Create: `packages/api-client/src/mock/repository.ts`
- Test: `packages/api-client/src/mock/repository.test.ts`

**Interfaces:**
- Consumes: shared domain types from Task 1.
- Produces: `CareerRepository`, `ApiError`, `createMockRepository(options?): CareerRepository`, `resetMockData(): Promise<void>`.

- [ ] **Step 1: Write repository contract tests**

```ts
it('filters active jobs and paginates deterministically', async () => {
  const repo = createMockRepository({ storage: 'memory', latencyMs: 0 })
  const page = await repo.jobs.list({ city: ['上海'], sort: 'latest', page: 1, pageSize: 2 })
  expect(page.items.every((job) => job.city.includes('上海') && job.status === 'active')).toBe(true)
  expect(page.items).toHaveLength(Math.min(2, page.total))
})

it('creates only one active application per user and job', async () => {
  const repo = createMockRepository({ storage: 'memory', latencyMs: 0 })
  const first = await repo.applications.start('job-001')
  const second = await repo.applications.start('job-001')
  expect(second.id).toBe(first.id)
})
```

- [ ] **Step 2: Run tests and verify the missing repository failure**

Run: `pnpm --filter @career-launch/api-client test`

Expected: FAIL because the mock repository is not implemented.

- [ ] **Step 3: Implement contracts, fixtures, and persistence adapters**

```ts
export interface CareerRepository {
  auth: { requestCode(email: string): Promise<{ expiresIn: number }>; verifyCode(email: string, code: string): Promise<User>; logout(): Promise<void> }
  jobs: { list(query: JobQuery): Promise<Page<Job>>; get(id: string): Promise<Job>; favorite(id: string, value: boolean): Promise<void> }
  companies: { list(query: ListQuery): Promise<Page<Company>>; get(id: string): Promise<Company> }
  knowledge: { listArticles(query: ContentQuery): Promise<Page<Article>>; getArticle(id: string): Promise<Article>; listQuestions(query: ContentQuery): Promise<Page<Question>> }
  applications: { list(): Promise<Application[]>; start(jobId: string): Promise<Application>; updateStage(id: string, stage: ApplicationStage, note?: string): Promise<Application> }
  resumes: { list(): Promise<Resume[]>; get(id: string): Promise<Resume>; save(value: Resume): Promise<Resume>; remove(id: string): Promise<void> }
  admin: AdminRepository
  reset(): Promise<void>
}
```

Seed at least 12 companies, 36 jobs across major cities and categories, 8 articles, 24 questions, one student user, two administrators, two resumes, and six applications. Use recognizable fictional company names and non-production external URLs.

- [ ] **Step 4: Run repository tests and type checking**

Run: `pnpm --filter @career-launch/api-client test && pnpm --filter @career-launch/api-client typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the repository layer**

```bash
git add packages/api-client
git commit -m "feat: add typed mock repository and demo data"
```

---

### Task 3: Product Design System and Application Shells

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/src/tokens.css`
- Create: `packages/ui/src/base.css`
- Create: `packages/ui/src/components/AppLogo.vue`
- Create: `packages/ui/src/components/EmptyState.vue`
- Create: `packages/ui/src/components/StatusBadge.vue`
- Create: `packages/ui/src/index.ts`
- Create: `apps/web/package.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.ts`
- Create: `apps/web/src/App.vue`
- Create: `apps/web/src/router.ts`
- Create: `apps/web/src/layouts/PublicLayout.vue`
- Create: `apps/admin/package.json`
- Create: `apps/admin/vite.config.ts`
- Create: `apps/admin/index.html`
- Create: `apps/admin/src/main.ts`
- Create: `apps/admin/src/App.vue`
- Create: `apps/admin/src/router.ts`
- Create: `apps/admin/src/layouts/AdminLayout.vue`
- Test: `packages/ui/src/components/EmptyState.test.ts`

**Interfaces:**
- Produces: CSS tokens `--cl-primary`, `--cl-text`, `--cl-muted`, `--cl-surface`, `--cl-border`, spacing and radius scales.
- Produces: `EmptyState` props `{ title: string; description?: string; actionLabel?: string }` and `action` event.

- [ ] **Step 1: Write the failing empty-state accessibility test**

```ts
it('renders a labelled action and emits action', async () => {
  const wrapper = mount(EmptyState, { props: { title: '暂无收藏', actionLabel: '去找职位' } })
  expect(wrapper.get('[role="status"]').text()).toContain('暂无收藏')
  await wrapper.get('button').trigger('click')
  expect(wrapper.emitted('action')).toHaveLength(1)
})
```

- [ ] **Step 2: Run the component test and verify failure**

Run: `pnpm --filter @career-launch/ui test`

Expected: FAIL because `EmptyState.vue` is missing.

- [ ] **Step 3: Implement tokens, shared components, and both shells**

```css
:root {
  --cl-primary: #315cf5;
  --cl-primary-hover: #2449d8;
  --cl-text: #172033;
  --cl-muted: #68748a;
  --cl-surface: #ffffff;
  --cl-canvas: #f5f7fb;
  --cl-border: #e1e6ef;
  --cl-radius-sm: 8px;
  --cl-radius-md: 12px;
  --cl-radius-lg: 18px;
}
```

The student shell uses a top navigation with a mobile drawer. The admin shell uses a collapsible side navigation and top account menu. Both shells expose a `<RouterView />`, skip link, and main landmark.

- [ ] **Step 4: Run component tests and build both empty applications**

Run: `pnpm --filter @career-launch/ui test && pnpm --filter @career-launch/web build && pnpm --filter @career-launch/admin build`

Expected: PASS.

- [ ] **Step 5: Commit the design system and shells**

```bash
git add packages/ui apps/web apps/admin
git commit -m "feat: create product design system and app shells"
```

---

### Task 4: Student Home and Public Discovery

**Files:**
- Create: `apps/web/src/features/home/HomePage.vue`
- Create: `apps/web/src/features/home/HeroSearch.vue`
- Create: `apps/web/src/features/home/DeadlineJobs.vue`
- Create: `apps/web/src/features/home/FeaturedCompanies.vue`
- Create: `apps/web/src/features/jobs/JobCard.vue`
- Create: `apps/web/src/features/companies/CompanyCard.vue`
- Test: `apps/web/src/features/home/HomePage.test.ts`

**Interfaces:**
- Consumes: `CareerRepository.jobs.list`, `CareerRepository.companies.list`, `formatDeadline`.
- Produces: home route `/`, `HeroSearch` event `search(keyword: string)`.

- [ ] **Step 1: Write the failing home-page behavior test**

```ts
it('routes a keyword search to the jobs page', async () => {
  const wrapper = mountHome()
  await wrapper.get('input[aria-label="搜索公司、岗位或城市"]').setValue('Java')
  await wrapper.get('button[type="submit"]').trigger('click')
  expect(router.currentRoute.value.fullPath).toBe('/jobs?keyword=Java')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --filter @career-launch/web test -- HomePage.test.ts`

Expected: FAIL because the page does not exist.

- [ ] **Step 3: Implement the responsive homepage**

Render the active recruitment season, hero search, urgent deadlines, latest roles, featured companies, resume entry, application entry, and interview-guide entry. Every data section must render loading, error, empty, and success states from the repository result.

```ts
function submitSearch(keyword: string) {
  router.push({ name: 'jobs', query: keyword.trim() ? { keyword: keyword.trim() } : {} })
}
```

- [ ] **Step 4: Run the home test and student build**

Run: `pnpm --filter @career-launch/web test -- HomePage.test.ts && pnpm --filter @career-launch/web build`

Expected: PASS.

- [ ] **Step 5: Commit the public homepage**

```bash
git add apps/web/src/features/home apps/web/src/features/jobs/JobCard.vue apps/web/src/features/companies/CompanyCard.vue apps/web/src/router.ts
git commit -m "feat: build student discovery homepage"
```

---

### Task 5: Job Search, Job Detail, and Company Directory

**Files:**
- Create: `apps/web/src/features/jobs/JobsPage.vue`
- Create: `apps/web/src/features/jobs/JobFilters.vue`
- Create: `apps/web/src/features/jobs/JobDetailPage.vue`
- Create: `apps/web/src/features/companies/CompaniesPage.vue`
- Create: `apps/web/src/features/companies/CompanyDetailPage.vue`
- Create: `apps/web/src/stores/session.ts`
- Test: `apps/web/src/features/jobs/JobsPage.test.ts`
- Test: `apps/web/src/features/jobs/JobDetailPage.test.ts`

**Interfaces:**
- Consumes: `JobQuery`, query serialization utilities, job/company repository methods.
- Produces: routes `/jobs`, `/jobs/:id`, `/companies`, `/companies/:id`.

- [ ] **Step 1: Write failing URL synchronization and application-start tests**

```ts
it('writes selected city and sort to the URL', async () => {
  const wrapper = mountJobs('/jobs?keyword=Java')
  await wrapper.get('[aria-label="工作城市"]').setValue('上海')
  await wrapper.get('[aria-label="排序方式"]').setValue('deadline')
  expect(router.currentRoute.value.query).toMatchObject({ keyword: 'Java', city: '上海', sort: 'deadline' })
})

it('creates a pending application before opening the official link', async () => {
  const { wrapper, repo, openExternal } = mountJobDetail('job-001')
  await wrapper.get('button[data-action="apply"]').trigger('click')
  expect(repo.applications.start).toHaveBeenCalledWith('job-001')
  expect(openExternal).toHaveBeenCalledAfter(repo.applications.start)
})
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm --filter @career-launch/web test -- JobsPage.test.ts JobDetailPage.test.ts`

Expected: FAIL because pages and controls are missing.

- [ ] **Step 3: Implement job and company browsing flows**

Job filters include keyword, recruitment season, city, category, education, and deadline availability. Job detail shows source, updated time, deadline, company context, description, requirements, similar jobs, favorite action, and official application action. Company pages support keyword, industry, ownership, and city, with active roles on each detail page.

```ts
async function apply(job: Job) {
  requireSession()
  await repository.applications.start(job.id)
  window.open(job.applyUrl, '_blank', 'noopener,noreferrer')
  showReturnConfirmation(job.id)
}
```

- [ ] **Step 4: Run focused tests and build**

Run: `pnpm --filter @career-launch/web test -- JobsPage.test.ts JobDetailPage.test.ts && pnpm --filter @career-launch/web build`

Expected: PASS.

- [ ] **Step 5: Commit public discovery flows**

```bash
git add apps/web/src/features/jobs apps/web/src/features/companies apps/web/src/stores apps/web/src/router.ts
git commit -m "feat: add job and company discovery flows"
```

---

### Task 6: Interview Guide and Knowledge Search

**Files:**
- Create: `apps/web/src/features/knowledge/KnowledgePage.vue`
- Create: `apps/web/src/features/knowledge/ArticleDetailPage.vue`
- Create: `apps/web/src/features/knowledge/QuestionBank.vue`
- Create: `apps/web/src/features/knowledge/QuestionCard.vue`
- Test: `apps/web/src/features/knowledge/KnowledgePage.test.ts`

**Interfaces:**
- Consumes: knowledge repository methods and session favorite action.
- Produces: routes `/knowledge`, `/knowledge/articles/:id`, query filters `type`, `companyId`, `category`, `stage`, `difficulty`, `keyword`.

- [ ] **Step 1: Write the failing content-mode and filter test**

```ts
it('switches from guides to questions while retaining the keyword', async () => {
  const wrapper = mountKnowledge('/knowledge?keyword=Java&type=article')
  await wrapper.get('button[role="tab"][data-type="question"]').trigger('click')
  expect(router.currentRoute.value.query).toMatchObject({ keyword: 'Java', type: 'question' })
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --filter @career-launch/web test -- KnowledgePage.test.ts`

Expected: FAIL because the knowledge routes do not exist.

- [ ] **Step 3: Implement guides, article reading, and question bank**

Render article cards with reading time, company/category tags, and publish date. Render question cards with difficulty, stage, question body, collapsible reference approach, and a clear distinction that the content is a reference rather than a unique answer.

```ts
const contentType = computed<'article' | 'question'>(() => route.query.type === 'question' ? 'question' : 'article')
function setContentType(type: 'article' | 'question') {
  router.replace({ query: { ...route.query, type, page: '1' } })
}
```

- [ ] **Step 4: Run tests and student build**

Run: `pnpm --filter @career-launch/web test -- KnowledgePage.test.ts && pnpm --filter @career-launch/web build`

Expected: PASS.

- [ ] **Step 5: Commit interview content features**

```bash
git add apps/web/src/features/knowledge apps/web/src/router.ts
git commit -m "feat: add interview guide and question bank"
```

---

### Task 7: Authentication, Profile, Favorites, and Notifications

**Files:**
- Create: `apps/web/src/features/auth/LoginDialog.vue`
- Create: `apps/web/src/features/profile/ProfileLayout.vue`
- Create: `apps/web/src/features/profile/ProfilePage.vue`
- Create: `apps/web/src/features/profile/FavoritesPage.vue`
- Create: `apps/web/src/features/profile/HistoryPage.vue`
- Create: `apps/web/src/features/profile/NotificationsPage.vue`
- Create: `apps/web/src/router/guards.ts`
- Test: `apps/web/src/features/auth/LoginDialog.test.ts`
- Test: `apps/web/src/router/guards.test.ts`

**Interfaces:**
- Consumes: repository authentication and personal-data methods.
- Produces: `sessionStore.requireLogin(returnTo?: string): Promise<boolean>`, protected `/me/*` routes.

- [ ] **Step 1: Write failing login and route-guard tests**

```ts
it('enforces a valid email before requesting a code', async () => {
  const wrapper = mount(LoginDialog)
  await wrapper.get('input[type="email"]').setValue('invalid')
  await wrapper.get('button[data-action="send-code"]').trigger('click')
  expect(wrapper.get('[role="alert"]').text()).toContain('请输入有效邮箱')
})

it('opens login and preserves the protected destination', async () => {
  await router.push('/me/applications')
  expect(sessionStore.loginReturnTo).toBe('/me/applications')
  expect(sessionStore.loginVisible).toBe(true)
})
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm --filter @career-launch/web test -- LoginDialog.test.ts guards.test.ts`

Expected: FAIL because authentication UI and guards are missing.

- [ ] **Step 3: Implement the mock login and personal center**

The demo login visibly states the fixed code `246810`. Sending a code starts a 60-second resend countdown. Successful login returns to the protected destination. Profile forms validate required graduation year and email format; favorites and history group jobs, companies, and articles; notifications support read/unread filtering and mark-all-read.

```ts
async function verify(email: string, code: string) {
  const user = await repository.auth.verifyCode(email, code)
  sessionStore.setUser(user)
  const target = sessionStore.consumeReturnTo() ?? '/'
  await router.push(target)
}
```

- [ ] **Step 4: Run focused tests and build**

Run: `pnpm --filter @career-launch/web test -- LoginDialog.test.ts guards.test.ts && pnpm --filter @career-launch/web build`

Expected: PASS.

- [ ] **Step 5: Commit authentication and personal center**

```bash
git add apps/web/src/features/auth apps/web/src/features/profile apps/web/src/router apps/web/src/stores
git commit -m "feat: add mock authentication and personal center"
```

---

### Task 8: Application Board, Timeline, and Reminders

**Files:**
- Create: `apps/web/src/features/applications/ApplicationsPage.vue`
- Create: `apps/web/src/features/applications/ApplicationBoard.vue`
- Create: `apps/web/src/features/applications/ApplicationList.vue`
- Create: `apps/web/src/features/applications/ApplicationDrawer.vue`
- Create: `apps/web/src/features/applications/ReminderForm.vue`
- Create: `apps/web/src/features/applications/stages.ts`
- Test: `apps/web/src/features/applications/stages.test.ts`
- Test: `apps/web/src/features/applications/ApplicationsPage.test.ts`

**Interfaces:**
- Consumes: application and reminder repository methods.
- Produces: `canTransition(from: ApplicationStage, to: ApplicationStage): boolean`, protected route `/me/applications`.

- [ ] **Step 1: Write failing stage-rule tests**

```ts
it.each([
  ['pending_confirmation', 'applied', true],
  ['applied', 'interview', true],
  ['offer', 'written_test', false],
  ['rejected', 'interview', false],
] as const)('%s -> %s is %s', (from, to, expected) => {
  expect(canTransition(from, to)).toBe(expected)
})
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm --filter @career-launch/web test -- stages.test.ts ApplicationsPage.test.ts`

Expected: FAIL because transition rules and pages are missing.

- [ ] **Step 3: Implement board/list views and detail drawer**

The board groups by seven stages and supports keyboard-accessible stage changes through a select menu; drag and drop is an enhancement, never the sole interaction. The detail drawer shows the immutable timeline, current note, next event, and reminder editor. Invalid backward transitions require an explicit correction reason and append a timeline event.

```ts
export function canTransition(from: ApplicationStage, to: ApplicationStage): boolean {
  const terminal = new Set<ApplicationStage>(['offer', 'rejected', 'closed'])
  return from === to || !terminal.has(from)
}
```

- [ ] **Step 4: Run focused tests and build**

Run: `pnpm --filter @career-launch/web test -- stages.test.ts ApplicationsPage.test.ts && pnpm --filter @career-launch/web build`

Expected: PASS.

- [ ] **Step 5: Commit the application workspace**

```bash
git add apps/web/src/features/applications apps/web/src/router.ts
git commit -m "feat: add application tracking workspace"
```

---

### Task 9: Resume Center, Structured Editor, and Print Templates

**Files:**
- Create: `apps/web/src/features/resumes/ResumesPage.vue`
- Create: `apps/web/src/features/resumes/ResumeEditorPage.vue`
- Create: `apps/web/src/features/resumes/ResumeForm.vue`
- Create: `apps/web/src/features/resumes/ResumePreview.vue`
- Create: `apps/web/src/features/resumes/templates/ClassicTemplate.vue`
- Create: `apps/web/src/features/resumes/templates/ModernTemplate.vue`
- Create: `apps/web/src/features/resumes/resume-print.css`
- Create: `apps/web/src/features/resumes/validation.ts`
- Test: `apps/web/src/features/resumes/validation.test.ts`
- Test: `apps/web/src/features/resumes/ResumeEditorPage.test.ts`

**Interfaces:**
- Consumes: resume repository methods and resume domain type.
- Produces: `validateResume(resume: Resume): ResumeValidation`, routes `/me/resumes`, `/me/resumes/:id/edit`.

- [ ] **Step 1: Write failing resume validation tests**

```ts
it('requires identity, contact, and one education item', () => {
  const result = validateResume(emptyResume())
  expect(result.valid).toBe(false)
  expect(result.errors.map((item) => item.path)).toEqual(expect.arrayContaining(['profile.name', 'profile.email', 'education']))
})
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm --filter @career-launch/web test -- validation.test.ts ResumeEditorPage.test.ts`

Expected: FAIL because resume validation and editor do not exist.

- [ ] **Step 3: Implement list, editor, autosave, preview, and print**

Resume sections include profile, education, internships, projects, skills, honors, and summary. Every repeating section supports add, edit, remove, collapse, and move up/down. Debounce autosave by 800ms; store unsaved recovery data before repository writes; use `beforeunload` only while dirty.

```ts
const saveState = ref<'saved' | 'saving' | 'error'>('saved')
const saveDraft = useDebounceFn(async () => {
  saveState.value = 'saving'
  try { resume.value = await repository.resumes.save(resume.value); saveState.value = 'saved' }
  catch { saveState.value = 'error'; recoveryStore.write(resume.value) }
}, 800)

function exportPdf() { window.print() }
```

Print CSS uses A4 dimensions, removes application chrome, preserves section headings with their first item, and inserts breaks only between repeatable entries.

- [ ] **Step 4: Run focused tests and build**

Run: `pnpm --filter @career-launch/web test -- validation.test.ts ResumeEditorPage.test.ts && pnpm --filter @career-launch/web build`

Expected: PASS.

- [ ] **Step 5: Commit the resume builder**

```bash
git add apps/web/src/features/resumes apps/web/src/router.ts
git commit -m "feat: add structured resume builder and print export"
```

---

### Task 10: Admin Dashboard and Recruitment Management

**Files:**
- Create: `apps/admin/src/stores/session.ts`
- Create: `apps/admin/src/router/guards.ts`
- Create: `apps/admin/src/features/auth/AdminLoginPage.vue`
- Create: `apps/admin/src/features/dashboard/DashboardPage.vue`
- Create: `apps/admin/src/features/companies/CompaniesPage.vue`
- Create: `apps/admin/src/features/companies/CompanyFormDrawer.vue`
- Create: `apps/admin/src/features/jobs/JobsPage.vue`
- Create: `apps/admin/src/features/jobs/JobFormDrawer.vue`
- Create: `apps/admin/src/features/seasons/SeasonsPage.vue`
- Test: `apps/admin/src/features/jobs/JobsPage.test.ts`

**Interfaces:**
- Consumes: `CareerRepository.admin` company, job, season, and dashboard methods.
- Produces: admin routes `/login`, `/`, `/companies`, `/jobs`, `/seasons`.

- [ ] **Step 1: Write the failing admin permission and status test**

```ts
it('requires confirmation with the job name before taking it offline', async () => {
  const wrapper = mountJobsAs('content_operator')
  await wrapper.get('[data-job="job-001"] [data-action="offline"]').trigger('click')
  expect(wrapper.get('[role="dialog"]').text()).toContain('后端开发工程师')
  await wrapper.get('[role="dialog"] button[data-action="confirm"]').trigger('click')
  expect(repository.admin.jobs.updateStatus).toHaveBeenCalledWith('job-001', 'offline')
})
```

- [ ] **Step 2: Run the focused admin test and verify failure**

Run: `pnpm --filter @career-launch/admin test -- JobsPage.test.ts`

Expected: FAIL because recruitment management pages do not exist.

- [ ] **Step 3: Implement dashboard and recruitment CRUD**

Use dense but readable tables with persistent filters, pagination, bulk selection, explicit status badges, creation/edit drawers, and named destructive confirmations. Dashboard cards link to the filtered list that explains each count. Super admin and content operator can both manage recruitment content.

```ts
const routes = [
  { path: '/', name: 'dashboard', component: () => import('./features/dashboard/DashboardPage.vue') },
  { path: '/companies', name: 'companies', component: () => import('./features/companies/CompaniesPage.vue') },
  { path: '/jobs', name: 'jobs', component: () => import('./features/jobs/JobsPage.vue') },
  { path: '/seasons', name: 'seasons', component: () => import('./features/seasons/SeasonsPage.vue') },
]
```

- [ ] **Step 4: Run admin tests and build**

Run: `pnpm --filter @career-launch/admin test -- JobsPage.test.ts && pnpm --filter @career-launch/admin build`

Expected: PASS.

- [ ] **Step 5: Commit recruitment administration**

```bash
git add apps/admin/src
git commit -m "feat: add recruitment operations console"
```

---

### Task 11: Excel Import Preview and Content Administration

**Files:**
- Create: `apps/admin/src/features/imports/JobImportPage.vue`
- Create: `apps/admin/src/features/imports/parseJobWorkbook.ts`
- Create: `apps/admin/src/features/knowledge/ArticlesPage.vue`
- Create: `apps/admin/src/features/knowledge/ArticleEditorPage.vue`
- Create: `apps/admin/src/features/knowledge/QuestionsPage.vue`
- Create: `apps/admin/src/features/knowledge/QuestionFormDrawer.vue`
- Test: `apps/admin/src/features/imports/parseJobWorkbook.test.ts`

**Interfaces:**
- Consumes: admin import and knowledge repository methods.
- Produces: `parseJobRows(rows: unknown[][]): JobImportPreview`, routes `/imports/jobs`, `/knowledge/articles`, `/knowledge/articles/:id`, `/knowledge/questions`.

- [ ] **Step 1: Write failing import-validation tests**

```ts
it('separates valid rows, warnings, and blocking errors', () => {
  const preview = parseJobRows([
    ['公司名称', '职位名称', '城市', '投递链接', '截止时间'],
    ['星海科技', '前端工程师', '上海', 'https://example.com/apply', '2026-10-20'],
    ['', '产品经理', '北京', 'invalid', 'not-a-date'],
  ])
  expect(preview.validRows).toHaveLength(1)
  expect(preview.invalidRows[0].errors.map((e) => e.field)).toEqual(expect.arrayContaining(['companyName', 'applyUrl', 'deadline']))
})
```

- [ ] **Step 2: Run the parser test and verify failure**

Run: `pnpm --filter @career-launch/admin test -- parseJobWorkbook.test.ts`

Expected: FAIL because the parser does not exist.

- [ ] **Step 3: Implement import preview and knowledge administration**

Accept `.xlsx` files up to 5MB and 2,000 data rows. Parse locally, show summary counts, render row-level errors, and enable confirmation only when at least one valid row exists. Article editor uses a safe Markdown subset; question management captures category, stage, difficulty, prompt, and reference approach.

```ts
export interface JobImportPreview {
  validRows: ParsedJobRow[]
  warningRows: ParsedJobRow[]
  invalidRows: ParsedJobRow[]
  headers: string[]
}
```

- [ ] **Step 4: Run import tests and admin build**

Run: `pnpm --filter @career-launch/admin test -- parseJobWorkbook.test.ts && pnpm --filter @career-launch/admin build`

Expected: PASS.

- [ ] **Step 5: Commit import and content tools**

```bash
git add apps/admin/src/features/imports apps/admin/src/features/knowledge apps/admin/src/router.ts
git commit -m "feat: add job import and interview content management"
```

---

### Task 12: User, Operator, Settings, and Audit Administration

**Files:**
- Create: `apps/admin/src/features/users/UsersPage.vue`
- Create: `apps/admin/src/features/operators/OperatorsPage.vue`
- Create: `apps/admin/src/features/settings/SettingsPage.vue`
- Create: `apps/admin/src/features/audit/AuditLogPage.vue`
- Create: `apps/admin/src/components/PermissionGate.vue`
- Test: `apps/admin/src/components/PermissionGate.test.ts`

**Interfaces:**
- Consumes: admin users, operators, settings, and audit repository methods.
- Produces: `PermissionGate` prop `allow: AdminRole[]`; routes `/users`, `/operators`, `/settings`, `/audit`.

- [ ] **Step 1: Write the failing role visibility test**

```ts
it('hides super-admin operations from content operators', () => {
  const wrapper = mount(PermissionGate, {
    props: { allow: ['super_admin'], currentRole: 'content_operator' },
    slots: { default: '<button>创建运营账号</button>' },
  })
  expect(wrapper.find('button').exists()).toBe(false)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --filter @career-launch/admin test -- PermissionGate.test.ts`

Expected: FAIL because the permission component is missing.

- [ ] **Step 3: Implement remaining administrative pages**

Content operators can search and inspect users and change user account status. Only super administrators can manage operator accounts, system display settings, and full audit details. Audit filters include operator, action, object type, and date range; detail views render a field-level change summary without secrets.

```vue
<template><slot v-if="allow.includes(currentRole)" /></template>
<script setup lang="ts">
defineProps<{ allow: AdminRole[]; currentRole: AdminRole }>()
</script>
```

- [ ] **Step 4: Run permissions tests and admin build**

Run: `pnpm --filter @career-launch/admin test -- PermissionGate.test.ts && pnpm --filter @career-launch/admin build`

Expected: PASS.

- [ ] **Step 5: Commit administration and permissions**

```bash
git add apps/admin/src/features/users apps/admin/src/features/operators apps/admin/src/features/settings apps/admin/src/features/audit apps/admin/src/components apps/admin/src/router.ts
git commit -m "feat: complete admin permissions and account management"
```

---

### Task 13: Responsive Polish, Error Recovery, and Acceptance Documentation

**Files:**
- Create: `apps/web/src/components/GlobalErrorBoundary.vue`
- Create: `apps/admin/src/components/GlobalErrorBoundary.vue`
- Create: `apps/web/src/features/demo/DemoReset.vue`
- Create: `apps/admin/src/features/demo/DemoReset.vue`
- Create: `docs/frontend-running.md`
- Create: `docs/frontend-acceptance.md`
- Modify: `package.json`
- Modify: `apps/web/src/App.vue`
- Modify: `apps/admin/src/App.vue`
- Test: `apps/web/src/components/GlobalErrorBoundary.test.ts`

**Interfaces:**
- Consumes: repository `reset()` and both application shells.
- Produces: root scripts `dev:web`, `dev:admin`, `test`, `typecheck`, `lint`, `build`; user-visible demo reset flow.

- [ ] **Step 1: Write the failing recoverable-error test**

```ts
it('shows a retry action without exposing the thrown message', async () => {
  const wrapper = mountBoundaryWithThrowingChild(new Error('internal database path'))
  expect(wrapper.get('[role="alert"]').text()).toContain('页面暂时无法加载')
  expect(wrapper.text()).not.toContain('internal database path')
  await wrapper.get('button[data-action="retry"]').trigger('click')
  expect(wrapper.emitted('retry')).toHaveLength(1)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --filter @career-launch/web test -- GlobalErrorBoundary.test.ts`

Expected: FAIL because the boundary component is missing.

- [ ] **Step 3: Implement recovery, responsive audit fixes, and documentation**

Add global route loading feedback, a retryable error surface, network-offline messaging, session-expiry handling, and confirmed demo reset. Verify layouts at 320px, 768px, 1024px, and 1440px. Document Node and pnpm requirements, install and start commands, URLs, demo student/admin accounts, fixed verification code, reset behavior, and the acceptance checklist covering every key flow in the spec.

```json
{
  "scripts": {
    "dev:web": "pnpm --filter @career-launch/web dev",
    "dev:admin": "pnpm --filter @career-launch/admin dev",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint",
    "build": "pnpm -r build"
  }
}
```

- [ ] **Step 4: Run the full frontend verification suite**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`

Expected: all commands exit with code 0; both application build directories are produced.

- [ ] **Step 5: Commit the acceptance-ready frontend**

```bash
git add apps packages docs package.json
git commit -m "feat: prepare complete frontend for acceptance"
```
