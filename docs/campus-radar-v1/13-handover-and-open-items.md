# 校招雷达交接文档与未完成清单

交接日期：2026-10-25（Asia/Shanghai）。项目目录：`/Users/wangcong/Desktop/校招雷达`。

本文件交接现有代码、数据位置、运行方式和剩余工作。依据为代码、配置及已保存的验收记录；不重新设计数据库，不扩大产品范围。

## 1. 当前结论与核对范围

**已有 33 个独立页面路由，本机 PostgreSQL 与前后端 API 已接通，个人求职工作台具备可持久化的主要操作；尚未完成原始需求的全部功能，也尚未完成公开生产上线。**

- 已有：真实注册登录、官方岗位目录、手动录入、筛选预览、投递看板、收藏、日程、简历、面试记录、学习记录、规划、Offer 对比、账号备份恢复等。
- 部分完成：订阅、内推、公司情报、知识内容、统计、引导、个人中心、社区和同路人。页面存在、记录可保存，不等于已有真实服务或多人协作。
- 尚未完成：持续招聘更新、内容运营、外部推送、真实多人社区/组队、公开内容审核、密码找回/邮箱验证/彻底注销、生产部署与运维验收。
- 已取消：外部 LLM、embedding 语义推荐、生成式模拟面试/报告、云端转写。不计入剩余工作，不需要模型密钥。

本次实际核对了页面文件、关键业务代码、Compose 映射、脱敏后的运行配置和历史报告。页面文件为 33 个，SQL 迁移文件为 11 个。本机配置为 `NEXT_PUBLIC_DATA_MODE=api`、`AUTH_PROVIDER=local`，数据库为 `127.0.0.1:54322/campus_radar`。

**运行状态限制：本次只读 `docker inspect` 返回 Docker socket 不存在，Docker 服务不可连接。** 没有复查当前账号/岗位数量，没有启动、迁移或修改数据库，也没有重跑数据库和浏览器全量测试。

2026-10-24 验收记录中的岗位 20 条、迁移 11 项是历史已验证结果。报告中的“账号 0”只描述当时验收结束的状态，不能代表此后没有注册；当前账号总数需启动 Docker 后查询。本次仅交付文档，没有实现下面的待办或执行部署。

## 2. 已确定的实现边界

### 数据和账号

- API 模式使用 PostgreSQL；演示模式保留虚构样本和浏览器存储。没有环境配置的新 checkout 默认进入演示模式。
- API 不自动导入浏览器演示记录，接口失败也不回退为虚构岗位。
- `public.users` 保存资料，`app.local_identities` 保存邮箱和 scrypt 密码哈希。没有明文密码文件或预设测试账号。
- 已有账号归属校验、受限数据库角色、RLS、会话 Cookie、CSRF/Origin 检查。工作区支持版本条件写入；个人资料 PATCH 的并发缺口见 U13。
- 沿用 PostgreSQL 16.6 + pgvector 0.8.7 与原数据卷；保留扩展兼容，当前不生成 embedding。

### 规则工具

保留关键词/偏好匹配、文本重点提炼、PDF/TXT/MD 文字提取、简历规则检查、题库模拟练习、自评和规则反馈、录音回放及手动转写。分数不代表录用概率或外部模型分析。没有真实题库时，不会凭空生成练习题。

### 公共和私人内容

- 社区动态、组队安排、公司观察及相关互动目前以账号内记录为主，没有真正的跨用户信息流或房间同步。
- **原创面经不同于私人社区记录**：现有保存链路会写入 `published` 面经，公共目录可以读取；讨论记录仍按账号隔离。不能笼统声称所有用户内容都只对本人可见。
- 手动岗位录入目前由已登录用户调用，写入公共目录并标注来源未核验。正式开放前必须补角色权限、审核、举报与下架链路，见 U03。

## 3. 页面逐项交接（全部 33 个路由）

“已接通”表示页面和主要 API/账号记录链路存在，不表示原始 PRD 每个细节均已实现或已完成生产验收。

| 路由 | 当前能力 | 未完成或受限内容 |
| --- | --- | --- |
| `/` | 落地页、目录数量、功能展示、FAQ | 仍含标注的演示截图和 Offer 故事；不是全网实时数据屏 |
| `/login` | 本地密码登录、会话、回跳 | 密码找回和生产账号运营链路未完成 |
| `/register` | 邮箱密码注册、账号持久化 | 本地模式未验证邮箱所有权 |
| `/onboarding` | API 资料和偏好保存 | 未完成“身份→简历→偏好→时间轴”四步真实流程 |
| `/jobs` | 真实目录、筛选排序、三视图、收藏、Drawer、录入 | 首批官方元数据；从 catalog 快照筛选/分批展示，不是海量服务端分页 |
| `/jobs/:id` | 来源链接、已知字段、规则匹配、投递收藏 | 完整 JD、DDL 等未知时不补造；关联内容受真实知识数据不足限制 |
| `/company/:id` | 公司岗位、标签页、个人观察/评价/开奖记录 | 缺公共核验的薪资、风格、员工评价及历年开奖资料 |
| `/subscriptions` | 条件保存、手动检查、命中记录、渠道偏好 | 无后台持续匹配和邮件/SMS/浏览器推送 |
| `/referral` | 个人进度、手动联系人/码记录 | 无真实公共内推库、身份验证、申请发送和回执 |
| `/pipeline` | 八阶段拖拽、顺序、泳道、笔记、撤销、归档、简历关联 | 不自动向公司投递或同步招聘系统状态；进度由用户维护 |
| `/calendar` | 视图、事件编辑、冲突提示、账号保存 | 未接外部日历和提醒渠道 |
| `/analytics` | 实际记录趋势、阶段/城市分布、基础比率、CSV | 缺完整历史漏斗、逐环节通过率、简历版本效果对比；部分文案仍写“本机” |
| `/resumes` | 私有上传/下载、版本、文本提取/预览、diff、投递关联 | 生产附件存储未部署；OCR 不在现有文字提取能力内 |
| `/interview/:id/timeline` | 轮次、时间线和关联记录保存 | 企业面试进度不会自动同步 |
| `/interview/:id/review` | 音频、手动转写、复盘、自评/规则反馈 | 云端转写与生成式报告已取消 |
| `/mock` | 题库配置、计时答题、暂停/报告/历史、草稿保存 | 依赖真实题目；模型面试官已取消 |
| `/style/:company` | 页面和个人准备记录入口 | 无真实风格权重/轮次/频次资料时 API 保留空态 |
| `/experiences` | 目录读取、筛选、原创编辑、收藏预览 | 缺授权内容运营和正式发布审核 |
| `/experiences/:id` | 正文目录、规则重点提炼、跳转、个人讨论 | 缺完整跨用户评论和举报处理闭环 |
| `/questions` | 筛选、练习、自评、错题/题单、收藏 | 缺经审核的题目、答案、公司频次及维护入口 |
| `/handbook` | 章节目录、笔记、完成进度 | 缺可交付的原创/授权内容与内容管理流程 |
| `/pack/:company` | 筛选已有面经/题目、整理题单 | 缺真实精选内容、风格和避坑资料 |
| `/resume-check` | 预览、关键词/规则诊断、修改建议、导出 | 仅规则能力；模型诊断已取消 |
| `/planner` | 时间轴、清单、里程碑保存 | 未接后台到期提醒和推送 |
| `/salary` | 本人录入、图表、对比 | 不是行业薪资库；缺核验样本、公开运营和可信度体系 |
| `/offer-compare` | 多 Offer、权重、排序、规则结论、保存 | 条款由用户输入，无企业核验或自动获取 |
| `/community` | 个人动态/草稿、讨论和互动记录保存 | 无真实多人公共流、跨用户互动、运营审核与通知 |
| `/buddy` | 个人练习安排、题单、备忘和房间记录 | 无真实用户匹配、邀请、成员权限和多人同步 |
| `/radar` | 页面及账号记录接口 | 无真实 OC/HC/开奖/热度来源，API 显示缺数据说明 |
| `/me` | 资料、投递/面试/Offer/收藏统计 | API 版缺完整活动时间线、徽章和匹配数概览 |
| `/favorites` | 岗位/公司/面经/题目分类与保存 | 内容覆盖受真实目录限制 |
| `/notifications` | 账号通知记录、已读处理 | 不代表已有外部渠道或完整后台事件生产 |
| `/settings` | 偏好主题、原生备份恢复、本人私有数据清空 | 彻底注销、找回/验证、生产推送未完成；“云端”应与本机部署区分 |

与原 PRD 的另一差异：API 工作区整体处于登录边界内，匿名访问 `/jobs` 等页面会跳登录。公共读取 API 已有，但“游客先浏览，收藏/投递才登录”的完整 UI 尚未交付，见 U11。

## 4. 未完成清单及验收条件

优先级：P0＝公开上线前必须处理；P1＝补齐业务；P2＝规模化与维护。内容准备和代码功能分别列明，空列表不一律等于接口未接通。

| 编号 | 优先级 / 类型 | 现状与缺口 | 完成时的验收条件 |
| --- | --- | --- | --- |
| U01 | P1 / 数据＋采集 | 一次小米采集，无持续更新/多公司覆盖。Scrapy/调度骨架未接成小米常态任务 | 逐来源审核后分页、去重、更新；任务重启可恢复、403/429 暂停；局部采集不误关未见岗位；有持续运行记录 |
| U02 | P1 / 内容＋管理 | 面经、题库、宝典、风格、薪资、雷达内容不足，缺完整内容后台 | 原创/授权内容带出处、时间、可信度；录入/审核/修改/下架流程可用；关联跳转和练习用真实内容验收 |
| U03 | P0 / 权限＋审核 | 登录用户的手动岗位、原创面经可进公共目录，缺角色和治理闭环 | 普通用户/审核员/管理员权限明确；状态迁移、越权测试、举报纠错下架及审计可用；未审核内容不冒充官方核验 |
| U04 | P1 / 后台服务 | 订阅仅保存/手动检查；日程、规划无后台提醒 | 独立任务产生事件并去重/重试；退订有效；站内通知和至少一个选定外部渠道真实送达、有回执 |
| U05 | P1 / 内推服务 | 只有个人记录，没有真实内推资源和申请交互 | 获准联系人/码带有效期，身份可核验；申请发送/接收/回执可用；手动进度不声称已发给他人 |
| U06 | P1 / 多用户 | 社区和讨论缺跨用户流、权限与通知 | 双账号验证公开范围、评论/点赞/删除/举报；私有内容不泄漏；审核与通知可追溯。公开面经同时按 U03 管理 |
| U07 | P1 / 协作 | 同路人为个人练习组 | 真实匹配、邀请/接受/退出；房主/成员权限；共享题单和成员进度同步；非成员访问被拒绝 |
| U08 | P1 / 公司与信号 | 雷达/风格/开奖/评价缺核验数据链路 | 信号有来源/时间，个人观察不作官方事实；排名/频次有定义和样本量；失效信息可处理 |
| U09 | P0 / 账号安全 | 本地邮箱未验证，无找回/修改密码完整产品闭环 | 实际邮件验证、短期单次令牌、找回/修改、必要的旧会话失效、限流；日志不含密码或令牌 |
| U10 | P0 / 生命周期 | 旧 `DATA_EXPORT`、`USER_ERASURE` 处理器未配置；不是原生备份缺失 | 注销涵盖身份、私有数据、附件、任务及保留策略；失败可追踪重试。若保留异步导出，补安全存储和过期链接；未完成保持开关关闭 |
| U11 | P1 / 页面闭环 | 引导仅资料表单；主页缺时间线/徽章；工作区强制登录 | 四步 API 引导可跳过附件并生成规划；真实事件/规则驱动主页；游客可读公开页面，写操作登录后回到原操作 |
| U12 | P1 / 分析 | 只有趋势/分布/基础比率 | 真实历史和简历关联驱动漏斗/环节通过率/版本效果；分母、时间窗、样本明确；归档/撤销/跨年/未知日期验收 |
| U13 | P1 / 技术 | 资料 PATCH 无服务端条件版本；catalog/Cmd+K 主要读取完整快照 | 资料版本/ETag 条件写入，冲突返回 409；双标签页不静默覆盖。大目录服务端分页/筛选/搜索仍保留预览与 URL 状态 |
| U14 | P0 / 部署 | 未交付阿里云/宝塔等生产环境；附件仍在本机 | HTTPS/域名、Origin、受限角色/密钥、反代、进程守护、重启恢复、增量迁移和附件持久化；部署后业务验收 |
| U15 | P0 / 运维 | 无生产自动备份、异地副本、告警与恢复演练证据 | 数据库＋附件＋必要密钥完整灾备；脱敏日志/请求编号、失败告警；演练并实测 RPO/RTO |
| U16 | P0 / 上线验证 | 未完成生产边缘限流、容量/性能、安全、可访问性验收 | 验证代理后客户端身份、匿名限流、上传限制、worker 出站限制；实测性能和键盘/移动端流程，留存失败项 |
| U17 | P1 / 文案一致性 | 搜索固定“演示内容”、分析写“本机”、部分反馈称“云端” | 依据数据模式和部署统一文案/标识；真实/样例可区分；逐页检查未知值、空态、错误、手机和控制台 |
| U18 | P2 / 工程交付 | 本批源码、迁移与验收资料已纳入 Git 交付；尚无 `.github` CI 工作流，未确定项目级 LICENSE | 后续改动及时提交；CI 执行选定检查；维护者确定许可证并同步依赖声明/配置说明 |

原始要求中的代理池/指纹反爬未实现。当前策略为显式标识、白名单、限速、robots 和遇限暂停；不把绕过限制作为补齐任务，U01 以获准来源稳定采集为目标。

## 5. 已取消项：不要重新列为欠账

2026-10-24 用户明确舍弃真正的 AI 能力，PRD 已同步：外部 LLM/付费调用/生成式复盘、embedding 和向量推荐、模型面试官/评分、云端转写均退出当前范围。

历史 `workers/campus_worker/ai/provider.py`、可空向量字段和环境变量占位仍可能存在；它们不是已上线能力，也不是必须接通的待办。不要因此删除数据卷、重设计数据库或配置付费调用。

## 6. 首批真实数据

2026-10-24 已验证导入小米官方岗位元数据 20 条：校招/实习各 10 条，只取各类型第一页，不是完整库存，不代表现在仍在招聘。

- 来源审核与说明：[官方来源说明](../../workers/official-sources/README.md)。审核发生在当时，不代表规则永久不变。
- 快照：[official-xiaomi-2026-10-24.json](../../workers/artifacts/official-xiaomi-2026-10-24.json)，采集时间 `2026-10-24T07:15:28.033Z`。
- SHA-256：`742e3beb233ad618426cc9797cfd734d2652884be25a4147402cfd918dd392d0`。
- 保留标题、城市、类型、发布日期、官方链接和溯源，没有复制完整 JD；学历/薪资/DDL 未知时不补造。
- 定时采集关闭。robots 当时返回 404 不等于获得转载许可。
- [离线导入脚本](../../scripts/load-official-jobs.mjs) 固定校验已审核快照，重复导入幂等。新抓取结果不能直接替换旧快照；需重新审核并更新准入机制，再接入常态任务。

API 模式没有真实面经/题库/宝典/薪资时继续保留空态，可以录入原创或获准内容，不能把演示样本标记成真实数据。

## 7. 数据实际位置与迁移注意事项

映射在 [docker-compose.yml](../../infrastructure/docker-compose.yml)：

```yaml
volumes:
  - campus_pg:/var/lib/postgresql/data
```

| 项目 | 当前配置 / 最近已验证值 |
| --- | --- |
| 容器 | `campus-radar-postgres-1` |
| 镜像 | `campus-radar-postgres:16.6-pgvector-0.8.7` |
| 数据库 | `campus_radar` |
| 端口 | 本机 `127.0.0.1:54322`，容器内 `5432` |
| 命名卷 | `campus-radar_campus_pg` |
| 容器内路径 | `/var/lib/postgresql/data` |
| Docker Linux VM 路径 | `/var/lib/docker/volumes/campus-radar_campus_pg/_data` |
| Mac 虚拟磁盘 | `/Users/wangcong/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw` |

不是直接绑定到项目目录的普通文件夹。`Docker.raw` 承载 Docker 虚拟磁盘，不能当 JSON 打开；不要把运行中的 PG 内部文件直接复制当成完整备份。服务器迁移要迁数据库、附件和必要密钥，不是只复制源码。

下列路径相对项目根目录，另有说明的除外：

| 路径 | 用途 |
| --- | --- |
| `apps/web/.data/private-files/` | 简历/音频原件；元数据在数据库，下载校验归属 |
| `.data/local-api-bootstrap/backups/` | 初始化/迁移脚本备份 |
| `/Users/wangcong/campus-radar-backups/` | pgvector 脚本备份，角色备份须私密保存 |
| `.data/inspection/2026-10-24T13-08-13-130Z/` | 人工查看 Markdown/JSON 快照；不自动更新，邮箱已遮罩，无密码 |
| `apps/web/.env.local` | 本机 API/受限连接/会话密钥；不是注册用户密码文件 |
| `.data/local-api-bootstrap/role-credentials.env` | 自动生成的数据库运行角色凭据，不公开、不抄入文档 |

`.data` 是隐藏目录，Finder 可按 `⌘⇧G` 输入完整路径。原生账号备份不替代完整灾备：它绑定账号 ID，由 `SESSION_ENCRYPTION_KEY` 签名；跨环境恢复需匹配身份和密钥，轮换密钥影响旧备份验证。

**不要用 `docker compose down -v`、删除卷或覆盖 `.env.local` 解决配置问题。** 最近验收迁移至 0011，后续继续通过校验账本增量迁移，不简单重放全部 SQL。

## 8. 关键代码与固定合同

路径相对仓库根目录。模块已经存在，不需要从头重写。

| 区域 | 入口 |
| --- | --- |
| 页面和 token | `apps/web/app/`、`apps/web/features/`、`apps/web/tailwind.config.ts` |
| 账号/API 适配 | `apps/web/components/campus-provider.tsx`、`apps/web/lib/api/adapter.ts`、`apps/web/server/auth.ts`、`apps/web/server/local-auth.ts` |
| 工作区隔离/挂载 | `apps/web/components/app-shell.tsx`、`apps/web/components/api-workspace-provider.tsx` |
| 目录/录入 | `apps/web/server/catalog.ts`、`apps/web/server/catalog-import.ts`、`apps/web/lib/catalog.ts` |
| 投递/收藏/资料 | `apps/web/server/private.ts`、`apps/web/lib/store.ts` |
| 扩展实体/版本 | `apps/web/server/workspace.ts`、`apps/web/server/workspace-schema.ts`、`apps/web/lib/api/workspace-client.ts` |
| 自动保存/冲突恢复 | `apps/web/lib/coalesced-draft-writer.ts`、`apps/web/components/workspace-save-errors.tsx` |
| 文件/原生备份 | `apps/web/server/files.ts`、`apps/web/server/account-data.ts`、`apps/web/features/account/cloud-data-tools.tsx` |
| 结构/迁移 | `database/migrations/`；实际顺序由 `scripts/setup-local-api.mjs` 控制 |
| 独立任务 | `workers/campus_worker/api/`、`executor/`、`scheduler/`、`crawlers/` |
| API 合同 | `docs/campus-radar-v1/openapi.json`、`12-api-persistence-implementation.md`、服务端 Zod schema |
| 真库浏览器验证 | `apps/web/e2e/real-data.spec.ts`、`apps/web/playwright.real.config.ts`、`scripts/verify-real-api.mjs` |

继续实现时保持以下合同：

1. 八阶段固定为 `PENDING → APPLIED → ASSESSMENT → INTERVIEW_1 → INTERVIEW_2 → HR → OFFER → CLOSED`，对应待投递/已投递/笔试/一面/二面/HR 面/Offer/已结束。
2. 白名单工作区 key 映射独立实体表，JSONB 存受校验扩展；不要退回所有业务只存一个无结构 JSON。
3. `PUT /api/v1/workspace/records/{key}` 使用 `{value,expectedVersion}`；409 保留草稿并显式加载服务端版本，失败不能提示保存成功。
4. 私有写入验证会话/CSRF/Origin，Web/worker 用受限角色；浏览器测试服务器不得拿数据库 owner 凭据。
5. 文件名随机且不在 `public/`；简历 10MB、音频 30MB、带原件备份总量当前上限 50MB。
6. `workspace/export|import|reset` 是已实现的同步原生备份/事务恢复/私有数据清空，不等同 `me/export` 或 `USER_ERASURE` 后台任务。清空保留登录身份、公共招聘和已发布原创。
7. `TASK_PROCESSING_ENABLED` 继续关闭；仅打开开关不会补齐处理器。
8. 爬虫等耗时任务走独立 Python executor，不放入主站请求同步执行。

## 9. 启动与复查命令

本机使用 Node.js 24 验证。下面供接手后操作，本次没有执行初始化、抓取、恢复或测试写入。

### 已有环境日常启动

先手动打开 Docker Desktop，等待就绪：

```sh
cd "/Users/wangcong/Desktop/校招雷达"
docker start campus-radar-postgres-1
npm run dev
```

开发地址：[http://127.0.0.1:3000](http://127.0.0.1:3000)。使用自己注册的账号，没有默认测试密码。Docker 未启动造成接口失败，不代表原卷数据丢失。

只有确需补本机环境/迁移时才另行运行：

```sh
node scripts/setup-local-api.mjs
```

它会备份、增量迁移、生成/复用凭据，不是只读检查，也不替代服务器迁移方案。

### 只读数据库核对

```sh
docker inspect campus-radar-postgres-1 --format '{{json .Mounts}}'
docker exec campus-radar-postgres-1 psql -X -U postgres -d campus_radar -c "SELECT extversion FROM pg_extension WHERE extname='vector';"
docker exec campus-radar-postgres-1 psql -X -U postgres -d campus_radar -c "SELECT count(*) AS jobs FROM public.jobs; SELECT count(*) AS users FROM public.users; SELECT count(*) AS migrations FROM app.schema_migrations;"
```

此处 owner 仅供本机管理员检查；主站使用受限角色。不要输出密码哈希、会话令牌、角色凭据或完整环境变量到交接文档。

### 代码与端到端复验

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:e2e:api
node --test scripts/setup-local-api.test.mjs scripts/verify-real-api.test.mjs workers/official-sources/xiaomi.test.mjs workers/official-sources/import.test.mjs
```

真正的浏览器→API→PostgreSQL 验证使用隔离 runner：

```sh
node scripts/verify-real-api.mjs
```

需要 Docker、原容器运行、现有 API 配置和空闲 3300 端口；runner 建可丢弃数据库/私有目录并清理。Mac 默认使用已安装 Google Chrome，其他环境按配置指定 `CHROME_BIN`。不要拿真实账号做破坏性测试，也不要把集成测试连接指向正式库。

## 10. 历史验证与尚未验证范围

以下是 **2026-10-24 的已保存结果，本次没有重跑**：

| 检查 | 历史结果 | 证据与局限 |
| --- | --- | --- |
| 类型/生产构建 | 当时通过 | [接入记录](12-api-persistence-implementation.md)，本次未重新构建 |
| 普通测试 | 153 通过，默认跳过 23 个 PG 用例 | 跳过不等于真库通过 |
| 另行真实 PostgreSQL | 5 套件、24 项通过 | 可丢弃库，覆盖归属/RLS/并发/文件/恢复/分页等 |
| 真实浏览器全链路 | 6 通过，0 失败/跳过，约 55.2 秒 | [Playwright JSON](../../artifacts/qa/real-api-playwright.json)，无 BFF 替身；不代表每个功能各有一项 E2E |
| mock 浏览器 | 44 通过 | 演示数据测试，不证明外部服务开通 |
| 账号边界浏览器 | 9 通过 | BFF 替身，不证明 Supabase 邮件或密码找回可用 |
| 初始化/runner/来源 Node | 16 通过 | 不替代现场采集和生产运行 |

汇总：[real-api-verification.json](../../artifacts/qa/real-api-verification.json)。`verification-summary.json` 和 08/10/11 的部分正文是旧阶段记录，其中“未接线”“外部 AI 待完成”等不再代表当前状态。当前范围以本文件、最新 PRD、12 的已实现合同结合代码判断。

尚无生产全链路验收：邮件/推送、跨用户社区/组队、常态采集、线上附件存储、Linux/宝塔部署、自动灾备恢复、压力容量指标。PRD 性能和可用性数字为目标，不是已测达标结果。

## 11. 建议接手顺序

1. 启动原 Docker，用只读命令核对卷、记录数和迁移账本；备份数据库、附件与必要密钥，保留全部未提交实现。
2. 先形成“个人求职工作台”发布范围：处理 U03/U09/U10/U14/U15/U16，修正 U17。未完成的多人/外部能力明确禁用或说明边界。
3. 处理 U01/U02，建立真实岗位和知识内容供应；同步处理 U13，避免目录变大仍整包加载。
4. 补 U04/U05/U11/U12，完成提醒、内推、引导/主页和统计细节。
5. 交付 U06/U07/U08 的真实多人社区、组队和情报体系，补 U18 的持续交付事项。

接手者不应另建数据库、删除旧卷或重新把真正 AI 列为待办。完成某项后记录实现、验收命令与日期；页面能打开或历史测试曾通过，不能单独视为该项完成。
