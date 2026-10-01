# 企业官网与应用分域 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 未登录看企业官网（介绍+联系方式+右上角登录），登录后进入应用（现有全部功能与导航），游客访问功能页跳官网并弹登录。

**Architecture:** `/` 双态渲染（HomeGate 按 session.user 切换 LandingPage/HomePage）；全局路由守卫先等会话 hydrate，未登录访问功能页重定向 `/` 并 requestLogin 记录 returnTo；头部导航按登录态双态渲染并新增退出按钮。功能路由路径不变。

**Tech Stack:** Vue 3 + pinia + vue-router + vitest（jsdom + @vue/test-utils）。不新增依赖。

**Spec:** `docs/superpowers/specs/2026-10-02-visitor-app-split-design.md`

## Global Constraints

- 不新增 npm 依赖；新文件 2 空格缩进，改压缩风格文件保持原风格。
- 用户可见文案简体中文；官网页为纯介绍（无任何可进入功能的链接/按钮，CTA 只触发登录）。
- 登录/退出、守卫行为全键盘可达；`prefers-reduced-motion` 下无多余动画。
- 现有 70 个测试全部保持通过。
- 退出登录为两步确认（防误触）。

## Review Focus

1. **hydrate 未完成时的闪错**——刷新功能页不应先渲染再被踢回。测试：守卫纯函数表驱动 + Task 4 手动验证刷新 `/me/workspace`。
2. **登录后回跳**——returnTo 必须生效。测试：LoginDialog 现有行为 + Task 4 手动验证（未登录开 /me/workspace → 登录 → 落在 /me/workspace）。
3. **官网页泄漏功能入口**——合理预期：游客在 `/` 看不到任何进入功能的链接。测试：Task 3 组件测试断言渲染无 RouterLink；Task 7 手动核对。
4. **退出后残留**——退出必须回 `/` 且登录框状态复位。手动验证（Task 7）。
5. **既有链接回归**——`/me/applications` 等旧链接仍经重定向可用。测试：既有 70 个测试全绿 + 手动抽查。

---

### Task 1: 守卫纯函数 authRedirect

**Files:**
- Create: `apps/web/src/features/auth/guard.ts`
- Test: `apps/web/src/features/auth/guard.test.ts`

**Interfaces:**
- Consumes: `User`（shared）
- Produces: `authRedirect(user: User | null, to: { path: string }): string | null`——返回重定向目标（当前仅 `'/'`）或 null 放行。

- [ ] **Step 1: Write the failing tests**

```ts
import type { User } from '@career-launch/shared'
import { describe, expect, it } from 'vitest'

import { authRedirect } from './guard'

const user: User = {
  id: 'user-1', email: 'student@example.com', nickname: '林同学', graduationYear: 2027,
  school: '启程大学', education: '本科', major: '计算机科学与技术', targetRoles: ['后端开发'],
  status: 'active', role: 'student',
}

describe('authRedirect', () => {
  it.each([
    [null, '/', null],
    [null, '/jobs', '/'],
    [null, '/me/workspace', '/'],
    [user, '/jobs', null],
    [user, '/me/workspace', null],
  ] as const)('user=%s visiting %s → %s', (currentUser, path, expected) => {
    expect(authRedirect(currentUser, { path })).toBe(expected)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @career-launch/web exec vitest run --environment jsdom src/features/auth/guard.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/features/auth/guard.ts`：

```ts
import type { User } from '@career-launch/shared'

export function authRedirect(user: User | null, to: { path: string }): string | null {
  if (user) return null
  if (to.path === '/') return null
  return '/'
}
```

- [ ] **Step 4: Run test to verify it passes**（Expected: PASS 5/5）

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/auth/guard.ts apps/web/src/features/auth/guard.test.ts
git commit -m "feat: add auth redirect decision function"
```

---

### Task 2: 官网介绍页 LandingPage

**Files:**
- Create: `apps/web/src/features/marketing/LandingPage.vue`

**Interfaces:**
- Produces: `<LandingPage @login="..." />`（emits `login`；页面内唯一动作是触发登录）。

**验证方式：** typecheck + 现有测试（无功能链接在 Task 4 的 HomeGate 测试中一并断言）+ Task 7 手动验收。

- [ ] **Step 1: Write the implementation**

```vue
<script setup lang="ts">
defineEmits<{ login: [] }>()
</script>
<template>
  <div class="landing">
    <section class="hero">
      <div class="cl-container hero-inner">
        <p class="eyebrow">面向高校应届生的一站式求职平台</p>
        <h1>把复杂的校招，<br />变成清晰的下一步</h1>
        <p class="lead">可信职位、专业简历与投递进度，在一个地方完成。覆盖秋招、春招、提前批与补录。</p>
        <button class="cl-primary-button cta" type="button" @click="$emit('login')">登录 / 注册</button>
        <small class="demo-note">演示环境：邮箱验证码登录，验证码见登录框提示。</small>
      </div>
    </section>

    <section class="cl-container section">
      <h2>启程校招能为你做什么</h2>
      <div class="cards">
        <article class="cl-card">
          <span aria-hidden="true">🔎</span>
          <h3>职位与公司库</h3>
          <p>运营人工维护的校招职位与公司信息，按城市、学历与岗位类别筛选，截止时间一目了然。</p>
        </article>
        <article class="cl-card">
          <span aria-hidden="true">📈</span>
          <h3>投递进度管理</h3>
          <p>从网申到 Offer 的每个阶段都有记录与提醒，临近截止主动提醒你跟进。</p>
        </article>
        <article class="cl-card">
          <span aria-hidden="true">📄</span>
          <h3>专业简历工具</h3>
          <p>结构化编辑简历，多模板实时预览，一键导出 PDF 投递。</p>
        </article>
      </div>
    </section>

    <section class="cl-container section">
      <h2>适合谁使用</h2>
      <p class="audience">正在准备秋招、春招、提前批或补录的高校应届生；已毕业但仍参与校园招聘的同学同样欢迎。</p>
    </section>

    <footer class="site-footer">
      <div class="cl-container footer-inner">
        <div>
          <strong>联系我们</strong>
          <p>邮箱：hello@qicheng.example.com</p>
          <p>公众号：启程校招（演示）</p>
          <p>办公地点：上海市杨浦区创智天地（演示）</p>
        </div>
        <p class="legal">本站为产品演示环境，页面内容与联系方式均为虚构示例。</p>
      </div>
    </footer>
  </div>
</template>
<style scoped>
.hero{padding:88px 0 72px;border-bottom:1px solid var(--cl-border);background:linear-gradient(135deg,var(--cl-primary-soft),var(--cl-surface) 58%)}
.eyebrow{margin:0 0 12px;color:var(--cl-primary);font-weight:700}
h1{margin:0;color:var(--cl-text-strong);font-size:clamp(38px,5vw,58px);line-height:1.12;letter-spacing:-.045em}
.lead{max-width:56ch;margin:20px 0 26px;color:var(--cl-muted);font-size:17px}
.cta{min-height:46px;padding:0 26px;font-size:16px}
.demo-note{display:block;margin-top:12px;color:var(--cl-subtle);font-size:12px}
.section{padding-top:56px}
.section h2{margin:0 0 18px;color:var(--cl-text-strong);font-size:28px;letter-spacing:-.03em}
.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.cards>article{display:grid;gap:8px;padding:24px}
.cards>span{color:var(--cl-primary)}
.cards h3{margin:0;font-size:17px}
.cards p{margin:0;color:var(--cl-muted);font-size:14px;line-height:1.7}
.audience{max-width:64ch;margin:0;color:var(--cl-muted);font-size:15px;line-height:1.8}
.site-footer{margin-top:72px;padding:34px 0;border-top:1px solid var(--cl-border);background:var(--cl-surface)}
.footer-inner{display:grid;gap:10px}
.footer-inner strong{color:var(--cl-text-strong)}
.footer-inner p{margin:4px 0;color:var(--cl-muted);font-size:13px}
.legal{color:var(--cl-subtle);font-size:12px}
@media(max-width:760px){.hero{padding:52px 0}.cards{grid-template-columns:1fr}}
</style>
```

- [ ] **Step 2: Run typecheck and existing tests**（Expected: PASS，新组件尚无人引用）

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/marketing/LandingPage.vue
git commit -m "feat: add marketing landing page for visitors"
```

---

### Task 3: 双态首页 HomeGate + 组件测试

**Files:**
- Create: `apps/web/src/features/home/HomeGate.vue`
- Test: `apps/web/src/features/home/HomeGate.test.ts`

**Interfaces:**
- Consumes: `useSessionStore`（pinia）、`HomePage`（`./HomePage.vue`）、`LandingPage`（`../marketing/LandingPage.vue`）
- Produces: `<HomeGate />`，无 props 无 emits。

- [ ] **Step 1: Write the failing tests**

```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import HomeGate from './HomeGate.vue'

const { sessionState } = vi.hoisted(() => ({
  sessionState: { user: null as null, requestLogin: vi.fn() },
}))

vi.mock('../../stores/session', () => ({ useSessionStore: () => sessionState }))

describe('HomeGate', () => {
  it('shows the marketing landing page for visitors', () => {
    sessionState.user = null
    const wrapper = mount(HomeGate)
    expect(wrapper.text()).toContain('面向高校应届生的一站式求职平台')
    expect(wrapper.findComponent({ name: 'HeroSearch' }).exists()).toBe(false)
  })

  it('shows the application home for signed-in users', () => {
    sessionState.user = { nickname: '林同学' } as never
    const wrapper = mount(HomeGate)
    expect(wrapper.findComponent({ name: 'HeroSearch' }).exists()).toBe(true)
    expect(wrapper.text()).not.toContain('联系我们')
  })
})
```

说明：`HeroSearch` 只存在于应用首页；mock store 避免真实 repository 调用（HomePage onMounted 会拉数据，mock store 不拦截——若 HomePage 拉数据导致测试环境报错，在两个用例外层包 `vi.mock('../../services/repository', () => ({ repository: { jobs: { list: async () => ({ items: [], page: 1, pageSize: 6, total: 0 }) }, companies: { list: async () => ({ items: [], page: 1, pageSize: 6, total: 0 }) } } }))`）。

- [ ] **Step 2: Run test to verify it fails**（Expected: FAIL —— 组件不存在）

- [ ] **Step 3: Write minimal implementation**

```vue
<script setup lang="ts">
import { useSessionStore } from '../../stores/session'
import LandingPage from '../marketing/LandingPage.vue'
import HomePage from './HomePage.vue'
const session = useSessionStore()
</script>
<template>
  <HomePage v-if="session.user" />
  <LandingPage v-else @login="session.requestLogin()" />
</template>
```

（无样式，纯切换。）

- [ ] **Step 4: Run test to verify it passes**（Expected: PASS 2/2）

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/home/HomeGate.vue apps/web/src/features/home/HomeGate.test.ts
git commit -m "feat: gate home page by session state"
```

---

### Task 4: 路由守卫与 `/` 接线

**Files:**
- Modify: `apps/web/src/router.ts`（`/` → HomeGate；追加 beforeEach）

**Interfaces:**
- Consumes: Task 1 `authRedirect`、`useSessionStore`（main.ts 已先装 pinia 后装 router，守卫执行时 pinia 可用）

**验证方式：** typecheck + 全部测试 + 手动：刷新 `/me/workspace`（未登录 → 官网+登录框；登录 → 回原页）。

- [ ] **Step 1: Wire the router**

`apps/web/src/router.ts`：`{path:'',name:'home',component:()=>import('./features/home/HomePage.vue')}` 改为 `component:()=>import('./features/home/HomeGate.vue')`；文件末尾追加（保持压缩风格）：

```ts
import { authRedirect } from './features/auth/guard'
import { useSessionStore } from './stores/session'
let sessionReady = false
router.beforeEach(async (to) => {
  const session = useSessionStore()
  if (!sessionReady) { await session.hydrate(); sessionReady = true }
  const redirect = authRedirect(session.user, to)
  if (redirect) { session.requestLogin(to.fullPath); return redirect }
  return true
})
```

（import 语句放文件顶部与其他 import 并列。）

- [ ] **Step 2: Run typecheck and full web tests**（Expected: PASS）

- [ ] **Step 3: Manual smoke**：`pnpm dev:web`，未登录直接打开 `/me/workspace` → 落在 `/` 且弹登录框；登录（`student@example.com`/`246810`）→ 回到 `/me/workspace`；再刷新页面不再被踢出。

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/router.ts
git commit -m "feat: guard functional routes behind authentication"
```

---

### Task 5: 双态头部与退出登录

**Files:**
- Modify: `apps/web/src/layouts/PublicLayout.vue`（头部双态 + 退出两步确认）
- Modify: `apps/web/src/features/profile/ProfileLayout.vue`（侧边导航旧链接/旧文案）
- Modify: `apps/web/src/features/home/HomePage.vue`（journey 卡旧链接）

**Interfaces:**
- Consumes: `useSessionStore.logout()`（已存在）
- Produces: 未登录头部 = logo + 登录按钮；登录头部 = 应用导航 + 昵称 + 退出（两步确认）。

- [ ] **Step 1: Rewrite PublicLayout header**

`<script setup>` 追加：

```ts
import { useRouter } from 'vue-router'
const router = useRouter()
const confirmLogout = ref(false)
async function signOut() {
  if (!confirmLogout.value) { confirmLogout.value = true; return }
  confirmLogout.value = false
  await session.logout()
  await router.push('/')
}
```

模板中 `<nav id="site-nav" ...>...</nav><RouterLink v-if="session.user" class="account-link" to="/me/profile">...</RouterLink><button v-else ...>登录 / 注册</button>` 改为：nav 与 account-link 包进 `<template v-if="session.user">`，其后追加退出按钮：

```html
<template v-if="session.user"><nav id="site-nav" :class="{open:menuOpen}" aria-label="主导航"><!-- 原五个 RouterLink 不变 --></nav><RouterLink class="account-link" to="/me/profile">{{session.user.nickname}}</RouterLink><span v-if="confirmLogout" class="logout-confirm"><button type="button" @click="confirmLogout=false">取消</button><button type="button" class="logout-final" @click="signOut">确认退出（回到官网首页，数据保留）</button></span><button v-else class="logout-button" type="button" @click="signOut">退出</button></template><button v-else class="cl-primary-button account-button" type="button" @click="menuOpen=false;session.requestLogin()">登录 / 注册</button>
```

（原 v-else 登录按钮补 `menuOpen=false` 收起窄屏菜单。）

样式追加：

```css
.logout-button{border:0;color:var(--cl-muted);background:transparent;font-size:14px;font-weight:600}
.logout-button:hover{color:var(--cl-text)}
.logout-confirm{display:flex;gap:8px;align-items:center;font-size:12px}
.logout-confirm button{border:0;color:var(--cl-muted);background:transparent;text-decoration:underline}
.logout-confirm .logout-final{color:#c2410c}
@media(max-width:850px){.logout-button{display:none}.logout-confirm{display:none}}
```

（窄屏退出走账户页，不在挤 header。）

- [ ] **Step 2: Fix stale links**

`ProfileLayout.vue`：侧边导航 `投递看板`/`/me/applications` → `求职工作台`/`/me/workspace`。
`HomePage.vue`：两处 `to="/me/applications"` → `to="/me/workspace"`。

- [ ] **Step 3: Run typecheck and full tests**（Expected: PASS）

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/layouts/PublicLayout.vue apps/web/src/features/profile/ProfileLayout.vue apps/web/src/features/home/HomePage.vue
git commit -m "feat: dual-mode header with sign-out confirmation"
```

---

### Task 6: 登录框回跳与文案

**Files:**
- Modify: `apps/web/src/features/auth/LoginDialog.vue`

- [ ] **Step 1: Adjust the dialog**

`verify()` 中 `const target=session.returnTo;session.returnTo=null;if(target)await router.push(target)` 改为：

```ts
const target=session.returnTo;session.returnTo=null;await router.push(target??'/')
```

intro 文案 `保存心仪职位、管理投递进度和制作简历。` 改为 `保存心仪职位、管理投递进度和制作简历。登录后将回到你刚才想看的页面。`

- [ ] **Step 2: Run typecheck and full tests**（Expected: PASS）

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/auth/LoginDialog.vue
git commit -m "feat: land signed-in users back where they were heading"
```

---

### Task 7: 全量验证与验收文档

**Files:**
- Modify: `docs/frontend-acceptance.md`

- [ ] **Step 1:** `pnpm -r --if-present test && pnpm -r --if-present typecheck && pnpm build` 全绿。
- [ ] **Step 2:** 手动核对 spec §9：未登录 `/` 看官网（无功能导航、底部联系方式）；未登录开 `/me/workspace`、`/jobs` → 官网+登录框；登录后 `/` 变应用首页；退出回官网；四档宽度无遮挡；键盘可达。
- [ ] **Step 3:** 验收清单"学生端"小节追加：

```markdown
- 未登录访问首页看到的是企业官网：产品介绍、能力概览与底部联系方式，右上角可登录，不出现功能导航。
- 未登录直接访问功能页会跳回官网并弹出登录框，登录后回到原目标页。
- 登录后首页切换为应用首页，头部出现功能导航与退出按钮；退出需两步确认并回到官网。
```

- [ ] **Step 4: Commit**

```bash
git add docs/frontend-acceptance.md
git commit -m "docs: extend acceptance checklist for visitor/app split"
```

---

## Self-Review 结论（已完成）

- Spec 覆盖：§3 路由双态 → Task 3/4；守卫 → Task 1/4；§4 头部双态/退出/联系方式页脚 → Task 2/5；§5 官网内容 → Task 2；§3 登录回跳 → Task 6；§8 测试 → Task 1/3；§9 验收 → Task 7。无遗漏。
- 旧链接清理（上一轮 deferred minor #12）并入 Task 5——本次重构导航属同一范围。
- 类型一致性：`authRedirect(user, {path})` 在 Task 1/4 一致；HomeGate 无外部消费方。
