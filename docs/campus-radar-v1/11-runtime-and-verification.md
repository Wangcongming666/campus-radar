# 后端配置与验证指南

本文补充根目录 [README](../../README.md)。除明确切换目录的步骤外，命令均在仓库根目录执行。

## 真实后端配置

1. 当前本机已完成真实 API 配置，直接 `npm run dev`。初始化/检查使用 `node scripts/setup-local-api.mjs`，不要覆盖已有 `apps/web/.env.local`。脚本验证 `campus-radar-postgres-1` 与原卷，先备份、再校验结构与迁移 checksum，自动生成限权登录和随机会话密钥；敏感文件权限 0600。
2. 迁移保留历史顺序 `0001 → 0003 → 0004 → 0002`，再按数字执行 `0005…0011`；已记录的迁移不得编辑。运行连接是仅属于 `campus_web` 的独立 LOGIN，不是 postgres owner。业务与 vector 仍在原库；embedding 字段保持 NULL，未调用外部模型。
3. 本机 `AUTH_PROVIDER=local` 使用 PostgreSQL 密码身份、scrypt 和不透明 HttpOnly 会话，可直接注册登录，不发送验证邮件。选择 `supabase` 时才需 `SUPABASE_URL`/`SUPABASE_ANON_KEY` 与邮件/PKCE 回调配置。两种提供方均需随机 32 字节 `SESSION_ENCRYPTION_KEY` 和固定 `APP_ORIGIN`；生产必须 HTTPS。
4. 已登录写入先 GET `/api/v1/me` 读取 `X-CSRF-Token`；匿名登录/注册先 GET `/api/v1/auth/csrf`。写入必须同源并带对应 token。模型/数据库/worker 密钥不得使用 `NEXT_PUBLIC_` 前缀。
5. `DATABASE_WORKER_URL` 是 Web 内部同步接收器的连接，`WORKER_DATABASE_URL` 是 Python 进程的连接；两者使用同一受限 worker 角色。填写共享 HMAC key/id 后才可接收批次。

部署建议保持已确认方案：Next.js → Vercel，worker → Railway/Fly.io，PG → Supabase/Neon。当前未创建云资源、付费任务或生产部署。

## 本地 worker 与 PG

### 一键启用已有本地库的 pgvector

沿用已定稿的 PostgreSQL 16 + pgvector，同一业务库与数据卷。针对当前已有容器，在项目根目录执行：

```sh
bash scripts/enable-pgvector.sh --check  # 可选，只读检查
bash scripts/enable-pgvector.sh          # 自动备份、构建、启用与验证
```

- 需要 Docker Desktop 已启动、Docker Compose v2，以及首次构建时可访问 Alpine 软件源和 GitHub。镜像默认使用阿里云 Alpine 镜像源下载同一发行版的软件包（保留 Alpine 签名校验），可在手动构建时用 APK_MIRROR build arg 指向其他受信任镜像。脚本兼容 macOS 自带 Bash 3.2，不依赖 jq 或 Python；Python 只用于开发测试。
- 仅接受正式容器 `campus-radar-postgres-1`、项目标签 `campus-radar`、服务 `postgres` 和数据卷 `campus-radar_campus_pg`。原卷必须已有 PostgreSQL 16 数据目录；任何检查不符都停止，不自动建库或重置。
- 使用 `infrastructure/postgres/Dockerfile`，在原 `postgres:16.6-alpine` 基础上编译 pgvector 0.8.7，保持同一主版本和 Alpine 运行环境。原卷内容保持不变，只替换服务容器的镜像。
- 启用前创建数据库自定义格式备份、角色备份、备份目录清单及原镜像恢复说明，并通过 `pg_restore --list` 检查备份可读取。备份默认在 `~/campus-radar-backups/pgvector-日期-唯一后缀/`，权限限制为当前用户；角色备份包含敏感信息，应私密保存。可用 `CAMPUS_PG_BACKUP_DIR` 指定备份位置。
- 备份或构建失败时不替换原容器；替换后的启动/卷检查失败且尚未执行扩展 SQL 时，尝试使用备份目录记录的原镜像恢复服务。扩展 SQL 使用事务；进入 SQL 阶段后发生错误，保留包含扩展文件的镜像以便检查重试，不自动降级或用备份覆盖原库。
- 脚本通过 `CREATE EXTENSION IF NOT EXISTS vector` 实现可重复启用，验证余弦距离和 1536 维字段支持。不会自动升级已经安装的旧版扩展，不执行 `0002_vector_capability.sql` 或其他业务迁移，不生成 embedding、不连接外部模型。
- 脚本用目录锁避免并发执行。若被强制终止后提示锁存在，先确认没有另一个启用任务，再移除 `infrastructure/.pgvector-enable.lock/`。保留原数据卷，禁止使用 `down -v` 处理失败。

开发验证命令（不对正式卷运行启用流程）：

```sh
bash -n scripts/enable-pgvector.sh
python3 -m unittest discover -s infrastructure/tests -v
# 构建镜像后可用临时、无网络、tmpfs 数据目录验证真实扩展 SQL：
PGVECTOR_IMAGE_TEST=1 python3 -m unittest discover -s infrastructure/tests -p test_pgvector_image.py -v
```

```sh
cp .env.example .env
# Docker Desktop 必须已运行；所有端口仅绑定本机。
docker compose --env-file .env -f infrastructure/docker-compose.yml up --build -d
```

全新卷自动执行 MVP 迁移及本地角色创建。已有卷需手动迁移，不能用删除卷代替升级。Docker 中的默认口令仅用于本地开发。来源 allowlist 默认空，启动不会抓取网站；实际来源必须确认授权、robots、频率、域名和内容再分发范围。

当前爬虫适配器接受已获准的标准化官方 JSON feed；没有伪装实现腾讯/字节网站专属分页，也不绕过登录、验证码、限流或访问规则。细节、环境变量和独立进程运行命令见 [worker 说明](../../workers/README.md)。

启用脚本历史验证（2026-10-24）：12 项脚本边界测试与 1 项真实 PostgreSQL 镜像测试通过。随后用户已在正式容器执行启用脚本，本轮只读确认 pgvector 0.8.7，未替换原卷。历史证据见 `artifacts/qa/pgvector-script-verification.json`。

## 尚未开通的真实能力

- Supabase 外部邮件仍需凭据；本机密码账号已实际跑通，不依赖 Supabase。
- 官方来源已审核并导入小米 20 条公开岗位元数据，详情见 `workers/official-sources/README.md`；没有完整 JD 再分发许可，故仅保留元数据和官方链接，未启动定时抓取。
- 外部LLM、embedding及服务端转写已由用户取消，不属于部署前置条件；历史预留provider代码和环境变量不启用。账号记录和私有附件已接通服务器，可在同一服务登录后读取。规则分析在浏览器执行并明确标注；爬虫由独立Python worker处理。外部推送和多人共享服务仍待完成。
- `/workspace/export|import|reset` 已实现即时原生备份、事务恢复及仅清空本人私有数据，可包含附件原件；与后台 `DATA_EXPORT` / `USER_ERASURE` 不同。后两种 worker 处理器尚未完成身份删除/保留策略，`TASK_PROCESSING_ENABLED` 继续关闭。local 模式无密码找回/邮箱所有权验证。
- 本机附件使用 `PRIVATE_FILE_ROOT` 持久磁盘。阿里云单实例可挂载私有目录；Vercel/多实例需对象存储或共享持久卷，不能使用临时函数磁盘作为正式文件存储。
- 尚未完成生产匿名边缘限流、监控服务配置、备份恢复演练和大数据量性能压测；文档中的性能数字是验收目标。

## 验证命令

```sh
npm run typecheck
npm test                         # 无 PG 时明确跳过数据库集成用例
npm run build
npm run test:e2e                 # 44 项本地功能浏览器测试（含33路由 smoke）
npm run test:e2e:api             # 独立3100端口：账号接入测试，BFF边界使用测试响应
node scripts/setup-local-api.mjs --integration-tests  # 真实PG：随机临时库，结束删除
node scripts/verify-real-api.mjs # 真实浏览器→API→PG，3300端口，随机库/附件，结束清理
```

macOS 浏览器测试默认使用 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，可用 `CHROME_BIN` 覆盖。mock 测试独立使用 3200/`.next-mock-test`，账号边界测试使用 3100/`.next-account-test`，真实数据库浏览器测试使用 3300/`.next-real-test`；不复用用户 3000 服务。真实测试 runner 不传递 owner 凭据到 Web，结束清理随机测试库和附件目录。业务正式库不存放验收账号。

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
