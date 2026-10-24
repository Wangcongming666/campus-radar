# Campus Radar Implementation Plan

**Goal:** 实现已确认的全站 mock 预览与 MVP 核心闭环，提供独立 worker 和数据库部署基础。
**Architecture:** Next.js App Router 按页面路由，按 features 拆业务；React Query 管读取，Zustand 持久化非敏感演示操作；Python worker 与 PostgreSQL 独立。
**Spec:** 00-proposal.md 与 01–06 六份已确认文档。
**Constraints:** 保留已有 Vue 文件删除状态；不部署、不提交既有变更；所有演示值明确标记；不调用付费 AI、不启动真实爬虫；全部 token 由 tailwind.config.ts 管理；真实服务缺少配置必须明确失败。

## Task 1: 可运行工作区与设计系统
- [x] 创建 apps/web/package.json、Next/TypeScript/Tailwind 配置、components.json 与根启动脚本；安装固定依赖。
- [x] 建立 components/ui（shadcn/Radix）、components/shared.tsx、lib/utils.ts、lib/data.ts、lib/store.ts、providers.tsx。
- [x] 建立 AppShell、33 路由注册表、主题、移动导航、全局命令面板、预览 Drawer 与 Toast。
- [x] 验证：npm run typecheck 与 npm run build；页面可由 npm run dev 启动。

## Task 2: MVP 核心闭环
- [x] jobs/page.tsx、jobs/[id]/page.tsx、company/[id]/page.tsx；搜索/筛选/排序/三视图/收藏/预览/加载更多。
- [x] pipeline/page.tsx；8列看板、拖动、菜单移动、笔记、归档/恢复、统计、撤销与本地演示持久化。
- [x] experiences/page.tsx、experiences/[id]/page.tsx、handbook/page.tsx；筛选、阅读、目录、私有演示笔记与进度。
- [x] domain.test.ts 先覆盖筛选、截止排序、看板移动/撤销/未知状态，再实现 lib/domain.ts；npm test 验证。

## Task 3: 全路由功能预览
- [x] 公共入口：落地页、登录注册演示、四步引导。
- [x] Discover/Pipeline/Interview/Knowledge/Growth/Community/Me 各页面按 IA 独立 route 组装，具备与页面任务对应的交互。
- [x] 共用 components/shared.tsx 合同：PageHeader(title,description?,action?)、Panel(title?,children,className?)、StatCard(label,value,change?,icon?)、EmptyState(title,description,action?)、DemoNotice；图表放 charts.tsx。
- [x] 数据合同在 lib/data.ts；业务状态在 lib/store.ts，所有跨页动作通过同一 store；不创建第二套收藏/投递数据。
- [x] 验证：逐路由 HTTP smoke；桌面和手机成组截图；检查 overflow、控制台、键盘与空态。

## Task 4: API 与持久化服务基础
- [x] MVP Route Handlers 使用共享数据与 domain，不暗示具备真实鉴权；无服务配置时返回结构化503；公开读取可从明确标记的 demo adapter 返回。
- [x] PostgreSQL/pgvector migrations、FastAPI 控制面、持久化任务租约、Scrapy 来源适配器、APScheduler 单活、安全同步和 env 示例。
- [x] worker tests 验证签名/重放、租约、取消、去重与重试；真实来源默认关闭。
- [x] README 说明 mock、本地服务、测试、已实现边界与后续真实接入步骤。

## Task 5: 整体验证
- [x] TypeScript、domain tests、生产 build、worker tests。
- [x] Playwright 核心流程：筛选→收藏→加入看板→移动→撤销；Cmd+K；主题与手机导航；全路由无运行错误。
- [x] 一次批量视觉检查，统一修复后确认；记录已验证结果与仍需真实服务的边界。

## Progress

2026-10-23：方案已确认，开始任务1。分工：主线程负责基础/MVP岗位看板/整合；独立任务分别负责 worker、扩展页面、知识账户页面。共享组件与合同先建立，再并行写不重叠文件。

Ruling: 安装时 npm 官方审计发现 Tailwind 3.4.19 的 braces/chokidar 等依赖存在未修复高危问题，改用 Tailwind 4.3.3 + @config 显式加载 tailwind.config.ts；设计 token 唯一来源不变。Vitest 同步升级5.0.5修复测试工具漏洞。需验证CSS兼容与生产build。

2026-10-23 实施记录：33路由mock与MVP核心交互已实现；Next业务接口具备真实PG路径，Python队列/控制面/调度/标准JSON源适配已实现。真实AI、具体招聘网站适配、云端导出/删除与生产部署保持未开通。验证结果详见08。

Ruling: 使用npm workspace与postgres.js参数化SQL，保留显式SQL迁移作为唯一schema来源，替代初稿中的pnpm与Drizzle；无用户可见行为变化。

Final review: 发现同列重排撤销使用过期排序键的问题；新增0004邻居快照迁移和三卡片真实PG回归，已观察失败后修复，6项API集成测试通过。
