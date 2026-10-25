# 校招雷达 · Campus Radar

面向大学生的校招工作台：筛选岗位、跟踪投递、管理简历、准备面试。

**本机真实 PostgreSQL/API 已接通 · 尚未部署生产环境**

交接入口：[当前状态与未完成清单（2026-10-25）](docs/campus-radar-v1/13-handover-and-open-items.md)，包含全部 33 个路由、剩余工作验收条件、数据位置和运行检查方式。

[快速开始](#快速开始) · [配置说明](#配置说明) · [开发指南](docs/campus-radar-v1/11-runtime-and-verification.md) · [接口定义](docs/campus-radar-v1/openapi.json)

前端：Next.js App Router、React、TypeScript、Tailwind CSS、shadcn/Radix UI。

后端：Next.js API、PostgreSQL、FastAPI、Scrapy、APScheduler。

2026-10-24 范围调整：已取消外部 AI、embedding 语义推荐和云端转写。保留关键词/偏好规则匹配、文本提炼、简历规则检查与题库模拟练习；无需配置模型密钥。现有 pgvector 扩展保留兼容，不生成向量。

## 截图 / 演示

[查看产品截图与设备检查报告](artifacts/qa/)。`functional-*` 为演示数据，`real-api-*` 为隔离真实数据库验收。

在线演示：暂无。TODO: 部署后补充访问地址。

## 功能特性

| 模块 | 主要功能 |
| --- | --- |
| 岗位 | 条件筛选、收藏、列表 / 卡片 / 表格视图、岗位与公司详情 |
| 投递 | 八阶段拖拽看板、笔记、归档恢复、阶段撤销、日程与统计 |
| 简历与面试 | PDF/TXT/MD 本地提取、PDF 预览、版本对比、面试记录与模拟练习 |
| 学习与决策 | 面经、题库、求职宝典、规划清单、Offer 加权对比 |
| 账号记录 | PostgreSQL 持久化、私有附件、原生备份恢复、暗亮主题与手机布局 |

工作台各模块已通过 Next API 接入 PostgreSQL；写入经服务器确认后更新，账号间以 RLS 隔离。API 模式不读取或自动导入浏览器演示记录。简历/录音原件保存到服务器私有目录，数据库保存文件元数据；多实例部署须挂载共享持久存储或接入对象存储。

本机真实库已收录 20 条小米官方公开岗位元数据（2026-10-24 采集，校招/实习各 10 条），保留原始链接及来源审核记录；未复制完整 JD，未启用定时采集。真实面经、薪资、题库与宝典无内容时展示空态，不混入虚构样本。匹配、摘要和评分目前使用规则，不代表 LLM 分析或录用概率。详见 [真实接入记录](docs/campus-radar-v1/12-api-persistence-implementation.md)。

## 环境要求

| 项目 | 要求 |
| --- | --- |
| Web 运行时 | Node.js 22.13+ 或 24+，使用 npm；本项目已用 Node.js 24 验证 |
| 操作系统 | 本地验证环境为 macOS；TODO: 补充 Linux / Windows 验证结果 |
| Python worker（可选） | Python 3.11+；容器使用 Python 3.12 |
| 本地后端（可选） | Docker 与 Docker Compose；仓库配置使用 PostgreSQL 16.6 |
| 真实账号服务 | PostgreSQL 本地密码账号，或配置完成的 Supabase Auth 项目 |

默认本地演示无需数据库、Docker 或外部 API 密钥。仅运行 Web 时无需安装 Python。

### 为已有本地 PostgreSQL 启用 pgvector

先打开 Docker Desktop，在 Mac 终端执行：

```sh
cd "/Users/wangcong/Desktop/校招雷达"
bash scripts/enable-pgvector.sh
```

脚本复用 `campus-radar-postgres-1` 和 `campus-radar_campus_pg`，自动备份、构建兼容扩展镜像、启用并验证 pgvector。首次构建需要联网；备份默认存入 `~/campus-radar-backups/`。运行 `bash scripts/enable-pgvector.sh --check` 可以先做只读检查。它不会执行业务表迁移或生成向量；详细恢复行为见 [启用说明](docs/campus-radar-v1/11-runtime-and-verification.md#一键启用已有本地库的-pgvector)。

## 安装

首次下载项目：

```sh
git clone https://github.com/Wangcongming666/campus-radar.git
cd campus-radar
npm ci
```

已有代码时，在仓库根目录执行上述依赖安装命令即可。

## 快速开始

在仓库根目录启动开发服务：

```sh
npm run dev
```

打开 [首页](http://127.0.0.1:3000) 或 [岗位工作台](http://127.0.0.1:3000/jobs)。本机已生成 `apps/web/.env.local` 并启用真实 API；先注册自己的账号。未设置环境变量的新 checkout 仍默认演示模式。

对当前已有 Docker PostgreSQL 重建真实 API 配置（先启动 Docker Desktop）：

```sh
node scripts/setup-local-api.mjs
```

脚本先备份、验证原卷和结构，再增量迁移并生成私有随机凭据；保留既有数据和密钥，重复执行安全。备份及凭据位于 gitignored `.data/local-api-bootstrap/`。不要用模板覆盖已经生成的 `.env.local`。官方元数据导入说明见 [来源说明](workers/official-sources/README.md)。

生产构建与本地预览：

```sh
npm run build
npm run start
```

## 配置说明

需要自定义配置或使用真实 API 时，先复制环境变量模板；已有配置文件时请直接编辑，避免覆盖：

```sh
cp .env.example apps/web/.env.local
```

下表默认值指未设置环境变量时的行为；模板中的数据库连接和口令仅供本地开发。

| 变量名 | 说明 | 是否必需 | 默认值 |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_DATA_MODE` | 数据模式，可选 `mock` / `api` | 否 | `mock` |
| `APP_ORIGIN` | Web 固定来源，需与访问地址一致 | 生产账号服务必需 | 开发时取请求来源 |
| `DATABASE_URL` | Web 使用的受限 PostgreSQL 连接 | API 模式必需 | 未设置 |
| `AUTH_PROVIDER` | `local` 本地密码账号 / `supabase` 外部身份服务 | 否 | `supabase` |
| `PRIVATE_FILE_ROOT` | 私有附件持久目录，不得置于 public/ | 附件功能必需 | 服务器私有目录 |
| `SUPABASE_URL` | Supabase 项目地址 | Supabase 模式必需 | 未设置 |
| `SUPABASE_ANON_KEY` | 当前 BFF 使用的 Supabase 项目公钥 | Supabase 模式必需 | 未设置 |
| `SESSION_ENCRYPTION_KEY` | Base64 编码的随机 32 字节会话密钥 | 真实账号服务必需 | 未设置 |
| `DATABASE_WORKER_URL` | Web 接收 worker 批次时使用的数据库连接 | 批次同步必需 | 未设置 |
| `WORKER_DATABASE_URL` | Python worker 使用的数据库连接 | 启用 worker 必需 | 未设置 |
| `SCHEDULER_DATABASE_URL` | 独立调度进程使用的数据库连接 | 启用调度必需 | 未设置 |
| `WORKER_CONTROL_TOKEN` | worker 内部控制接口令牌，至少 32 个字符 | 控制接口必需 | 未设置 |
| `WEB_INTERNAL_ORIGIN` | worker 回调的 Web 服务来源 | 批次同步必需 | 未设置 |
| `WORKER_HMAC_KEY` | Web 与 worker 共享的签名密钥，至少 32 字节 | 批次同步必需 | 未设置 |
| `WORKER_HMAC_KEY_ID` | 共享签名密钥的标识 | 批次同步必需 | 未设置 |
| `CRAWL_ALLOWED_SOURCES` | 逗号分隔的已批准来源 UUID | 启用采集必需 | 空，关闭采集 |
| `TASK_PROCESSING_ENABLED` | 云端导出和账号删除任务开关，当前应保持关闭 | 否 | `false` |

更改数据模式后需重启开发服务；生产环境需重新构建。数据库、模型和 worker 密钥不得使用 `NEXT_PUBLIC_` 前缀。

本机初始化脚本已处理迁移、限权角色和本地账号配置；选择 Supabase 提供方时另配邮件/回调。详见 [后端配置与验证指南](docs/campus-radar-v1/11-runtime-and-verification.md) 和 [worker 说明](workers/README.md)。

## 使用示例

启动默认演示后，可按以下流程体验：

1. 在岗位工作台筛选岗位，收藏或加入投递。
2. 打开投递看板，拖动阶段、填写笔记或安排日程。
3. 在简历库导入 PDF/TXT/MD，查看提取文本和版本差异。
4. 在模拟面试中完成练习，或在 Offer 对比中调整维度权重。

保持开发服务运行，在另一个终端读取三条岗位：

```sh
curl --fail 'http://127.0.0.1:3000/api/v1/jobs?limit=3'
```

接口定义见 [OpenAPI](docs/campus-radar-v1/openapi.json)。基本开发检查：

```sh
npm run typecheck
npm test
npm run build
```

浏览器测试、真实数据库测试和 worker 检查见 [验证指南](docs/campus-radar-v1/11-runtime-and-verification.md)。

## 常见问题

**为什么岗位和薪资不是实时数据？**

本机 API 已接入一次性审核后的官方岗位元数据；薪资、学历、DDL 未提供则显示未知。当前未运行定时采集，不能称为全网实时聚合。未配置 API 的演示模式仍使用明确标注的虚构样本。

**API 模式为什么有些列表是空的？**

工作台已接线。没有真实面经、题目、宝典或薪资记录时显示空态，支持的表单可新增账号记录。服务失败不会回退为演示数据，本地记录也不会自动导入账号。

**本地数据和简历存在哪里？**

API 模式的记录存 PostgreSQL，附件存服务器私有目录，文件读写验证所属账号；设置页可导出带原件的签名原生备份并恢复。演示模式才使用 localStorage/IndexedDB，演示登录页不要输入真实密码。

**是否需要 AI 密钥？账号记录可以同步吗？**

不需要。外部 LLM、embedding 和云端转写已取消，当前工具使用明确标注的规则。账号数据已在服务器持久化，同一服务登录后可读取；录音支持回放和手动转写。外部推送和多人共享仍需实现；即时账号备份/恢复/私有数据清空已可用，异步身份彻底删除 worker 仍关闭。

**为什么部分测试被跳过？**

真实 PostgreSQL 用例需要已迁移的可丢弃测试库，未配置时会明确跳过。浏览器测试的账号响应使用测试替身，不证明 Supabase 邮件或生产身份服务已开通。

## 许可证

TODO: 项目尚未提供项目级 LICENSE，请维护者确定许可证并添加文件。

第三方组件和 PDF.js 资源保留各自许可证，见 [第三方声明](THIRD_PARTY_NOTICES.md)。

## 贡献

TODO: 维护者确认是否接受外部 PR，以及补充贡献指南、Issue / PR 模板。

问题反馈可使用 [GitHub Issues](https://github.com/Wangcongming666/campus-radar/issues)，请注明运行环境、复现步骤和错误信息；提交日志前移除密钥与个人数据。

## 联系方式

GitHub：[@Wangcongming666](https://github.com/Wangcongming666)。

TODO: 补充项目维护者邮箱或讨论区地址。
