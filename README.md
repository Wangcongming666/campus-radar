# 校招雷达 · Campus Radar

面向大学生的校招工作台：筛选岗位、跟踪投递、管理简历、准备面试。

**开发中 · 本地演示可用 · 尚未部署生产环境**

[快速开始](#快速开始) · [配置说明](#配置说明) · [开发指南](docs/campus-radar-v1/11-runtime-and-verification.md) · [接口定义](docs/campus-radar-v1/openapi.json)

前端：Next.js App Router、React、TypeScript、Tailwind CSS、shadcn/Radix UI。

后端：Next.js API、PostgreSQL、FastAPI、Scrapy、APScheduler。

## 截图 / 演示

[查看产品截图与设备检查报告](artifacts/qa/)，截图使用演示数据。

在线演示：暂无。TODO: 部署后补充访问地址。

## 功能特性

| 模块 | 主要功能 |
| --- | --- |
| 岗位 | 条件筛选、收藏、列表 / 卡片 / 表格视图、岗位与公司详情 |
| 投递 | 八阶段拖拽看板、笔记、归档恢复、阶段撤销、日程与统计 |
| 简历与面试 | PDF/TXT/MD 本地提取、PDF 预览、版本对比、面试记录与模拟练习 |
| 学习与决策 | 面经、题库、求职宝典、规划清单、Offer 加权对比 |
| 本地记录 | 刷新恢复、跨标签同步、附件备份恢复、暗亮主题与手机布局 |

以上功能在默认本地模式中提供。真实 API 已接入账号和个人资料，其余工作台模块仍需逐步接线。

初始岗位、薪资和面经均为虚构样本；匹配、摘要和评分使用本地规则，不代表 LLM 分析或录用概率。详见 [功能清单](docs/campus-radar-v1/10-local-functional-completion.md)。

## 环境要求

| 项目 | 要求 |
| --- | --- |
| Web 运行时 | Node.js 22.13+ 或 24+，使用 npm；本项目已用 Node.js 24 验证 |
| 操作系统 | 本地验证环境为 macOS；TODO: 补充 Linux / Windows 验证结果 |
| Python worker（可选） | Python 3.11+；容器使用 Python 3.12 |
| 本地后端（可选） | Docker 与 Docker Compose；仓库配置使用 PostgreSQL 16.6 |
| 真实账号服务（可选） | PostgreSQL 与配置完成的 Supabase Auth 项目 |

默认本地演示无需数据库、Docker 或外部 API 密钥。仅运行 Web 时无需安装 Python。

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

打开 [首页](http://127.0.0.1:3000) 或 [岗位工作台](http://127.0.0.1:3000/jobs)。默认使用本地演示模式，无需创建配置文件。

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
| `SUPABASE_URL` | Supabase 项目地址 | 真实账号服务必需 | 未设置 |
| `SUPABASE_ANON_KEY` | 当前 BFF 使用的 Supabase 项目公钥 | 真实账号服务必需 | 未设置 |
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

真实 API 还需完成数据库迁移、运行角色和 Supabase 邮件 / 回调配置；仅切换模式不会接通整站业务。详见 [后端配置与验证指南](docs/campus-radar-v1/11-runtime-and-verification.md)、[MVP 接入计划](docs/campus-radar-v1/09-mvp-integration-plan.md) 和 [worker 说明](workers/README.md)。

## 使用示例

启动默认演示后，可按以下流程体验：

1. 在岗位工作台筛选岗位，收藏或加入投递。
2. 打开投递看板，拖动阶段、填写笔记或安排日程。
3. 在简历库导入 PDF/TXT/MD，查看提取文本和版本差异。
4. 在模拟面试中完成练习，或在 Offer 对比中调整维度权重。

保持开发服务运行，在另一个终端读取三条演示岗位：

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

默认使用虚构样本。真实招聘源尚未接入，采集默认关闭；现有适配器仅支持已批准的标准 JSON feed。

**切换到 API 模式后为什么部分模块不可用？**

账号和个人资料已接线，其余工作台模块显示接入状态。服务失败不会自动回退为演示数据，本地记录也不会自动导入云端。当前边界见 [交付状态](docs/campus-radar-v1/08-delivery-status.md)。

**本地数据和简历存在哪里？**

演示记录保存在当前浏览器，附件使用 IndexedDB；简历提取与预览在本机执行，不上传原件。清理站点数据会删除本地记录，建议先在设置页导出含附件的备份。演示登录页不要输入真实密码。

**是否已经接入 AI、云端转写和跨设备同步？**

尚未接通生产用的 LLM、embedding、服务端转写、外部推送、跨设备存储及多人组队服务。录音支持本地回放和手动转写；云端数据导出与账号删除接口当前默认返回 503。

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
