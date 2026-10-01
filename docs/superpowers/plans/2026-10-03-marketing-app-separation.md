# 官网与应用彻底分离 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/` 永久只做企业官网；登录后进入求职工作台；删除应用内带营销 Hero 的功能首页。

**Architecture:** 移除 1b 的 HomeGate 双态，`/` 直接渲染 LandingPage；LandingPage 依据会话渲染 CTA（未登录=登录/注册，已登录=进入求职工作台）；登录默认落点改为 `/me/workspace`；删除 HomePage/HeroSearch 及其测试。

**Tech Stack:** Vue 3 + pinia + vue-router + vitest（jsdom + @vue/test-utils）。不新增依赖。

**Spec:** `docs/superpowers/specs/2026-10-03-marketing-app-separation-design.md`

## Global Constraints

- 不新增依赖；新文件 2 空格缩进，改压缩风格文件保持原风格。
- 文案简体中文；官网页对已登录用户不出现营销式的"登录"引导。
- 四档宽度（320/768/1024/1440）无遮挡；键盘可达。
- 删除组件时同步删除其独占测试与所有引用。

## Review Focus

1. **应用内残留营销首屏**——登录后任何页面不应出现"把复杂的校招"首屏。手动核对（Task 5）。
2. **登录落点**——登录后必须落在 `/me/workspace`。测试：LandingPage CTA + Task 5 手动。
3. **官网页对两种会话状态都正确**——已登录 CTA 不得再走登录流程。测试：Task 1。
4. **悬空引用**——删除 HomePage/HeroSearch 后无 import 残留、构建通过。验证：Task 3 步骤 + 全量 typecheck/build。

---

### Task 1: LandingPage 会话感知 CTA

**Files:**
- Modify: `apps/web/src/features/marketing/LandingPage.vue`
- Test: `apps/web/src/features/marketing/LandingPage.test.ts`

**Interfaces:**
- Consumes: `useSessionStore`（session.user / requestLogin）、`useRouter`
- Produces: `<LandingPage />`（不再需要 `login` emit；CTA 内部自行处理）

- [ ] **Step 1: Write the failing tests**

```ts
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'

import LandingPage from './LandingPage.vue'

const { sessionState } = vi.hoisted(() => ({
  sessionState: { user: null as { nickname: string } | null, requestLogin: vi.fn() },
}))

vi.mock('../../stores/session', () => ({ useSessionStore: () => sessionState }))

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
})

async function mountPage() {
  await router.push('/')
  await router.isReady()
  return mount(LandingPage, { global: { plugins: [router] } })
}

describe('LandingPage call to action', () => {
  it('asks visitors to sign in', async () => {
    sessionState.user = null
    const wrapper = await mountPage()

    await wrapper.get('.cta').trigger('click')
    expect(wrapper.get('.cta').text()).toBe('登录 / 注册')
    expect(sessionState.requestLogin).toHaveBeenCalled()
  })

  it('points signed-in visitors into the workspace', async () => {
    sessionState.user = { nickname: '林同学' }
    const wrapper = await mountPage()

    expect(wrapper.get('.cta').text()).toBe('进入求职工作台')
    await wrapper.get('.cta').trigger('click')
    expect(router.currentRoute.value.path).toBe('/me/workspace')
    expect(sessionState.requestLogin).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @career-launch/web exec vitest run --environment jsdom src/features/marketing/LandingPage.test.ts`
Expected: FAIL —— CTA 文案固定为"登录 / 注册"且 emit 而非跳转（第二个用例失败）。

- [ ] **Step 3: Implement**

`LandingPage.vue` script 改为：

```ts
import { useRouter } from 'vue-router'
import { useSessionStore } from '../../stores/session'
const session = useSessionStore()
const router = useRouter()
async function start() {
  if (session.user) await router.push('/me/workspace')
  else session.requestLogin()
}
```

CTA 按钮改为：

```html
<button class="cl-primary-button cta" type="button" @click="start">{{ session.user ? '进入求职工作台' : '登录 / 注册' }}</button>
```

（删除 `defineEmits`；Hero 下方 demo-note 文案保留。）

- [ ] **Step 4: Run test to verify it passes**（Expected: PASS 2/2）

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/marketing/LandingPage.vue apps/web/src/features/marketing/LandingPage.test.ts
git commit -m "feat: session-aware landing call to action"
```

---

### Task 2: 路由改为官网直出 + 登录落点工作台

**Files:**
- Modify: `apps/web/src/router.ts`（`/` → LandingPage）
- Modify: `apps/web/src/features/auth/LoginDialog.vue`（默认落点 `/me/workspace`）

- [ ] **Step 1: Route `/` straight to the marketing page**

`router.ts` 中 `{path:'',name:'home',component:()=>import('./features/home/HomeGate.vue')}` 改为 `{path:'',name:'home',component:()=>import('./features/marketing/LandingPage.vue')}`。

- [ ] **Step 2: Land signed-in users in the workspace**

`LoginDialog.vue`：`await router.push(target??'/')` 改为 `await router.push(target??'/me/workspace')`。

- [ ] **Step 3: Run typecheck and full web tests**

Run: `pnpm --filter @career-launch/web exec vue-tsc --noEmit && pnpm --filter @career-launch/web test`
Expected: PASS（HomeGate 仍存在但已无引用，Task 3 删除）。

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/router.ts apps/web/src/features/auth/LoginDialog.vue
git commit -m "feat: serve marketing page at root and land logins in the workspace"
```

---

### Task 3: 删除双态首页与功能首页

**Files:**
- Delete: `apps/web/src/features/home/HomeGate.vue`、`HomeGate.test.ts`、`HomePage.vue`、`HeroSearch.vue`、`HeroSearch.test.ts`

- [ ] **Step 1: Delete the files**

```bash
git rm apps/web/src/features/home/HomeGate.vue apps/web/src/features/home/HomeGate.test.ts apps/web/src/features/home/HomePage.vue apps/web/src/features/home/HeroSearch.vue apps/web/src/features/home/HeroSearch.test.ts
```

- [ ] **Step 2: Verify no dangling references and the build is clean**

```bash
grep -rn "HomePage\|HomeGate\|HeroSearch" apps/web/src packages || echo "clean"
pnpm --filter @career-launch/web exec vue-tsc --noEmit && pnpm --filter @career-launch/web test
pnpm --filter @career-launch/web build
```

Expected: grep 无输出（或仅剩注释性文字）；typecheck PASS；测试 PASS；build 成功。

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor: remove the marketing-style application home page"
```

（`git rm` 已暂存删除；若 JobCard/HeroSearch 仍被他人引用，grep 会拦下，先修引用再提交。）

---

### Task 4: 验收文档与导航文案核对

**Files:**
- Modify: `docs/frontend-acceptance.md`

- [ ] **Step 1:** 把 1b 添加的"未登录访问首页看到的是企业官网…"三条改为反映新行为：

```markdown
- 无论是否登录，访问 `/` 看到的都是企业官网：产品介绍、能力概览与底部联系方式，不出现任何求职功能内容。
- 未登录直接访问功能页会跳回官网并弹出登录框；登录成功后进入求职工作台 `/me/workspace`。
- 已登录在官网页看到"进入求职工作台"入口；头部出现功能导航与退出按钮，退出需两步确认并回到官网。
```

- [ ] **Step 2:** `pnpm -r --if-present test && pnpm -r --if-present typecheck && pnpm build` 全绿。

- [ ] **Step 3: Commit**

```bash
git add docs/frontend-acceptance.md
git commit -m "docs: update acceptance checklist for marketing/app separation"
```

---

## Self-Review 结论（已完成）

- Spec 覆盖：§2 规则 → Task 1/2/3；§3 路由与登录落点 → Task 2；§4 组件改动 → Task 1/3；§5 测试 → Task 1/3；§6 验收 → Task 4。无遗漏。
- 删除清单与 grep 守卫在 Task 3 相互印证，避免悬空引用。
- 类型一致性：LandingPage 不再有 emit，唯一消费方是 router（Task 2 起指向它）。
