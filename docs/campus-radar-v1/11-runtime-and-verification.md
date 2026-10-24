# 后端配置与验证指南

本文补充根目录 [README](../../README.md)。除明确切换目录的步骤外，命令均在仓库根目录执行。

## 真实后端配置

1. 复制根 `.env.example` 到 `apps/web/.env.local`，填写 Web 环境变量；需要真实 API 时设 `NEXT_PUBLIC_DATA_MODE=api`。
2. PostgreSQL 迁移由受信任的迁移角色按顺序执行：`0001_mvp.sql` → `0003_runtime_boundaries.sql` → `0004_stage_order_snapshots.sql`。运行连接使用非 owner 的 `campus_web` 成员；内部同步使用 `campus_worker` 成员。`0002_vector_capability.sql` 属于 V2，需 pgvector 发行版并确认 1536 维模型后再执行。
3. 配置 `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SESSION_ENCRYPTION_KEY`（随机 32 字节的 Base64）和固定 `APP_ORIGIN`。Supabase 中配置验证邮件和 `/auth/callback` 返回地址。注册、登录、注销和 PKCE 回调在服务端执行，浏览器只持不透明 HttpOnly 会话。
4. 已登录写入先 GET `/api/v1/me` 读取 `X-CSRF-Token`；匿名登录/注册先 GET `/api/v1/auth/csrf`。写入必须同源并带对应 token。模型/数据库/worker 密钥不得使用 `NEXT_PUBLIC_` 前缀。
5. `DATABASE_WORKER_URL` 是 Web 内部同步接收器的连接，`WORKER_DATABASE_URL` 是 Python 进程的连接；两者使用同一受限 worker 角色。填写共享 HMAC key/id 后才可接收批次。

部署建议保持已确认方案：Next.js → Vercel，worker → Railway/Fly.io，PG → Supabase/Neon。当前未创建云资源、付费任务或生产部署。

## 本地 worker 与 PG

```sh
cp .env.example .env
# Docker Desktop 必须已运行；所有端口仅绑定本机。
docker compose --env-file .env -f infrastructure/docker-compose.yml up --build -d
```

全新卷自动执行 MVP 迁移及本地角色创建。已有卷需手动迁移，不能用删除卷代替升级。Docker 中的默认口令仅用于本地开发。来源 allowlist 默认空，启动不会抓取网站；实际来源必须确认授权、robots、频率、域名和内容再分发范围。

当前爬虫适配器接受已获准的标准化官方 JSON feed；没有伪装实现腾讯/字节网站专属分页，也不绕过登录、验证码、限流或访问规则。细节、环境变量和独立进程运行命令见 [worker 说明](../../workers/README.md)。

## 尚未开通的真实能力

- Supabase 外部邮件/登录需要项目凭据和部署回调配置；当前验证使用合成测试会话，没有调用真实身份项目。
- 真实招聘源需来源审核与站点适配；当前无“实时聚合全网”的生产数据。
- 云端 embedding、LLM 生成、服务端转写、外部推送、跨设备存储和多人组队尚未接线。本地文件提取、规则分析、完整操作与持久化已实现；录音支持回放与手动转写，浏览器语音能力不可用时回退文字输入。
- `DATA_EXPORT` / `USER_ERASURE` worker 处理器尚未接入私有存储、身份删除和保留策略，相关 API 默认503。保持 `TASK_PROCESSING_ENABLED=false`；设置为 true 只会入队，当前 worker 不支持实际处理。设置页可导出/恢复/重置完整本机数据，附件使用 IndexedDB 并可一并备份；这不等同云端账号删除。
- 尚未完成生产匿名边缘限流、监控服务配置、备份恢复演练和大数据量性能压测；文档中的性能数字是验收目标。

## 验证命令

```sh
npm run typecheck
npm test                         # 无 PG 时明确跳过数据库集成用例
npm run build
npm run test:e2e                 # 44 项本地功能浏览器测试（含33路由 smoke）
npm run test:e2e:api             # 独立3100端口：账号接入测试，BFF边界使用测试响应
```

macOS 浏览器测试默认使用 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，可用 `CHROME_BIN` 覆盖。其他系统安装 Playwright Chromium 后执行。mock 测试会重用已有本地服务，未启动时自动运行开发服务。API 测试始终启动独立模式的开发服务；不要与另一 Next 开发进程同时运行，以免争用 `.next/dev` 锁。API 浏览器测试验证表单、路由、adapter、CSRF 和会话状态，不创建真实 Supabase 用户，也不证明外部邮件已开通。

真实 PostgreSQL API 测试只对**已迁移的可丢弃测试库**运行，必须分别提供迁移 owner / Web / worker 的 DSN：

```sh
cd apps/web
API_INTEGRATION_DATABASE_URL='<test-owner-dsn>' \
DATABASE_URL='<test-web-dsn>' DATABASE_WORKER_URL='<test-worker-dsn>' \
../../node_modules/.bin/vitest run server/api.integration.test.ts
```

worker：

```sh
python3 -m venv workers/.venv
workers/.venv/bin/pip install -r workers/requirements.txt
PYTHONPATH=workers workers/.venv/bin/python -m unittest discover -s workers/campus_worker/tests -v
# 指定 TEST_DATABASE_URL 后增加真实 PG 权限/租约/并发测试；禁止指向生产库。
```

逐页能力见 [本地功能完成清单](10-local-functional-completion.md)。本轮验证结果与未接线边界见 [交付状态](08-delivery-status.md)；截图与设备检查报告位于 `artifacts/qa/`。

## 代码与文档入口

- `apps/web/app/`：独立页面和 API 路由。
- `apps/web/features/`：岗位、投递、知识、成长等页面业务。
- `apps/web/components/`：shadcn/Radix 源码组件、壳层与反馈组件。
- `apps/web/tailwind.config.ts`：设计 token；Tailwind 4 使用 `@config` 显式加载，CSS 变量由此生成。
- `apps/web/server/`：HTTP 校验、鉴权、事务、公开检索与私有业务。
- `apps/web/lib/api/`：类型合同与显式 adapter；`lib/store.ts` 只保存非敏感演示操作。
- `database/migrations/`：Web 与 Python 唯一 SQL 迁移源。
- [六份前期文档与方案](00-proposal.md)、[OpenAPI](openapi.json)、[实施计划](07-implementation-plan.md)。
