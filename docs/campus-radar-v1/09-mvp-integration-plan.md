# MVP 真实数据接入实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 将已确认的 MVP 从本地演示逐模块接入已有 BFF 与 PostgreSQL；本批交付真实身份会话和个人资料读写。

**Architecture:** Providers 创建独立于 Zustand 演示资料的 HttpAdapter，React Query 管理会话和按用户隔离的私有缓存。BFF 继续持有 HttpOnly 会话与 CSRF；客户端不保存密码、provider token 或 session token。API 模式尚未接入的页面展示接入状态，不挂载演示模块。

**Tech Stack:** Next.js App Router、TypeScript、React Query、现有 shadcn 组件、Supabase Auth BFF、PostgreSQL。

**Spec:** [已确认 PRD](01-prd.md)、[API 合同](05-api.md)、[当前边界](08-delivery-status.md)。

## Global Constraints

- 八个投递阶段保持 PENDING / APPLIED / ASSESSMENT / INTERVIEW_1 / INTERVIEW_2 / HR / OFFER / CLOSED。
- 默认 mock；API 出错不得退回演示数据。真实资料不得写入演示 localStorage。
- 只调用同源 BFF；所有数据写入保留服务端鉴权、CSRF 与 RLS。
- 保持暗亮主题、独立路由、响应式和统一 token。
- 不开通云服务、付费模型或爬虫，不提交、推送或恢复用户删除的 Vue 文件。

## 本批：身份与资料

### Task 1: 会话和数据入口

**Files:** 新增 `apps/web/lib/api/auth-policy.ts`、`auth-policy.test.ts`、`components/campus-provider.tsx`；修改 `components/providers.tsx`、`lib/api/adapter.ts`。

**Interfaces:** `safeReturnTo(value: string | null, fallback?: string): string` 只返回站内路由；`privateQueryKey(userId: string, ...parts: string[])` 生成按用户隔离的缓存键。`useCampus()` 提供 mode、adapter、user、会话状态、login/register/logout/refresh/updateProfile。

- [x] 写并运行失败测试：外部地址、协议相对地址、反斜杠、登录循环均不能成为登录跳转；站内筛选路径保留；不同用户缓存键隔离。
- [x] 实现 helper 与 Provider。401 代表未登录，503/网络失败显示可重试错误；退出前取消正在进行的请求并清理私有缓存。
- [x] `npm test --workspace=@campus-radar/web -- lib/api/auth-policy.test.ts`：全部通过。

### Task 2: 接入认证、资料与模块状态

**Files:** 新增 `features/auth/api-auth-page.tsx`、`features/account/api-account-page.tsx`、`components/api-workspace.tsx`；修改公共页面的模式入口、AppShell、`/me` 和 onboarding 的入口。

**Interfaces:** API 登录调用 `HttpAdapter.login(LoginRequest)`；注册调用 `register(RegisterRequest)` 并展示验证邮件提示；资料调用 `updateMe(UserPatch)`；演示页面与其本地 store 保持原行为。

- [x] 浏览器失败测试：API 登录使用密码字段；注册成功停留验证提示；刷新恢复身份；编辑资料后读到服务端返回；退出后不显示上一账号资料；503 不显示演示资料。
- [x] 实现 API 页面、会话错误/加载态、未登录跳转和待接入页面状态。API Cmd+K 不搜索演示内容。邮件 callback 原有 `/onboarding` 路由落入真实资料表单。
- [x] 浏览器边界测试通过。BFF 响应由测试替身提供，明确不等于 Supabase 外部服务联调。

### Task 3: 验证与交付记录

**Files:** 新增 `e2e/auth-api.spec.ts`、`playwright.api.config.ts`；更新 README、08 交付状态与本计划。

- [x] `npm run typecheck`、`npm test`、`npm run build` 全部通过；PG 测试无环境时显示跳过，不能称为本批实跑。
- [x] 独立端口运行 API 模式浏览器测试；原 mock 模式回归测试通过。
- [x] 记录本批实际覆盖、外部身份服务未联调、后续模块顺序与配置方式。

## 后续批次顺序

1. **MVP 公开数据**：岗位/公司/面经/宝典 DTO 与视图模型对接，服务端分页筛选、Drawer 和 Cmd+K 搜索。先统一 UUID 与现有演示 ID，禁止硬编码公司查表回退。
2. **MVP 私有操作**：收藏、投递看板、笔记与学习进度；移动携带 version、operationId，409 刷新提示、幂等重试与撤销遵循 BFF 合同。
3. **MVP 真实来源与上线验收**：经确认的官方公开来源、频率和 robots；种子数据/迁移、边缘限流、日志、备份与部署验证。
4. **V2**：个性化匹配、订阅推送、面试时间线、面经 AI 总结；先加 pgvector、预算与异步任务状态。
5. **V3**：模拟面试、简历诊断、社区和 Offer 决策真实业务接口。

## 执行记录

- 2026-10-23：延续用户已确认方案；本批限定为账号接入，以避免一次切换所有页面产生真实/演示数据混用。工作保持当前用户指定目录，不操作 Git 索引或分支。
- Task 1 complete：11 项身份导航/私有缓存测试通过；真实 QueryClient 的迟到响应取消已覆盖。
- Task 2 complete：账号与资料接线完成，原有 AppShell 复用；API 服务不可用不回退演示。私有 key 约定为 `['campus','private',userId,...parts]`，后续业务查询必须遵循。
- 审查修复：账号主题按登录/会话恢复应用；未编辑表单跟随远端快照，已编辑表单在检测到远端更新后需重载。两项均已浏览器 RED→GREEN。尚未引入资料 API 条件写入，无法防止最后一次会话读取后才发生的其他客户端写入；后续接入涉及并发编辑时应补服务端版本合同。
- 验证记录：35 项单元测试通过、6 项 PG 用例本批跳过；生产 build 与类型检查通过；9 项 mock 浏览器回归通过；API 浏览器测试使用外部边界替身，不代表真实 Supabase 邮件联调。
- 测试运行调整：两套 Playwright 测试使用独立产物目录，避免并行运行时清理彼此 trace；API 开发服务与另一个 Next dev 进程仍不能并行争用 `.next/dev`。
