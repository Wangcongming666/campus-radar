# 真实数据库与 API 接入执行记录

2026-10-24，用户授权把数据存储到现有数据库并接通前后端。数据库沿用 04 已定稿的 PostgreSQL 16 + pgvector；本文件记录实施和验收，不另建数据库方案。

## 本轮范围

- 在原库增量补齐资源表、用户隔离和必要角色，不清空已有表或数据卷。
- 本机账号真实注册/密码验证/会话，复用原 CSRF/HttpOnly/RLS；配置 Supabase 时保留原提供方。
- 岗位、公司、面经、题库、宝典目录从服务端读取；无数据时空态，不导入虚构招聘样本。
- 投递、收藏与所有扩展模块通过 API 读写，服务端确认成功才反馈保存成功。
- 简历和音频原件保存在服务端私有目录，元数据入库，下载严格校验所有权。
- 提供真实内容手动录入/JSON 导入。外部采集来源依实际授权/规则配置，不将样本标成真实招聘信息。
- 在现有库执行增量迁移；另建可丢弃测试库验证权限/并发/端到端操作后，浏览器实测本机真实服务。

## 并行职责与接口

- 0005：本地身份凭据，与现有 users/auth_sessions 对接。
- 0006：扩展实体表、GET workspace / GET-PUT records[key]、私有文件 API。
- 0007：核心目录、真实录入、投递与收藏 API / UI。
- 0008：岗位发布日期精度与来源观察记录；未知学历、薪资、DDL 保持未知。
- 0009：原生账号备份/事务恢复/本人私有数据清空。
- 0010：题目收藏，与岗位/公司/面经共用收藏表。
- 0011：账号动态讨论独立 `post_comments`，与本人动态组合外键关联，FORCE RLS；面经讨论正确解析实际页面键。
- workspace 读取返回 `{data:{records:{key:{value,version}}}}`，条件写入 `{value,expectedVersion}`，409 不覆盖。
- 兼容现有页面的集合键由服务端严格白名单解析；资源各自成表，核心字段和关系可查询，JSONB 仅承载经过校验的报告、偏好和 UI 扩展字段。
- API 模式只将服务端确认的值保存在浏览器内存；不自动把 localStorage/IndexedDB 演示内容导入真实账号。

## 验收

- [x] 注册、登录、退出、刷新恢复与第二账号隔离。
- [x] 真实录入岗位 → 收藏 → 投递 → 移动/笔记/日程，数据库可核验。
- [x] 简历上传/下载/版本、面试轮次/复盘、模拟练习报告持久化合同。
- [x] 面经/评论、题库与宝典进度、个人社区记录与组队工作区持久化合同。
- [x] 订阅/内推、规划、薪资、Offer、通知与个人设置。
- [x] 并发冲突、失败保存、错误态、文件归属与无样本泄漏。
- [x] 类型、生产构建、真实 PostgreSQL 和浏览器回归。

2026-10-24 最终验证结果（测试账户均在随机临时库）：

- `npm run typecheck`、Next.js 生产构建通过；私有运行时文件目录不进入构建追踪。
- 普通测试 153 项通过；默认未提供临时库时 23 项 PG 用例明确跳过。
- 另行真实 PostgreSQL 验证 5 套件共 24 项通过，包含资源字段/FK/RLS、并发版本、原生备份恢复、私有文件与微秒分页。
- 真实浏览器 → API → PostgreSQL **6/6 通过（55.2 秒）**：官方目录、双账号隔离、投递/轮次复盘、规划/日程/Offer/订阅、简历原字节、原创面经/两类讨论、原生备份清空恢复、主题/移动端/独立页面、原地冲突恢复、手动岗位录入与未知字段。
- 原有 mock 浏览器 **44/44 通过**，独立账号 BFF 边界测试 **9/9 通过**；后者不证明 Supabase 邮件开通。
- 初始化/隔离 runner 与官方采集/入库 Node 测试 **16/16 通过**；OpenAPI JSON 与 434 个本地引用可解析。
- 正式库只读核验：岗位20、账号0、迁移11；临时浏览器与集成测试库残留0。原容器/原数据卷保留。
- 简历、Offer权重与模拟回答使用防抖/串行合并最新值，失败保留草稿、显示未保存并支持重试，账号切换清除内存草稿。浏览器缓存清空不会删除已确认的数据库记录。

机器记录：`artifacts/qa/real-api-verification.json`；真实浏览器详细结果：`artifacts/qa/real-api-playwright.json`；桌面/手机截图：`artifacts/qa/real-api-*.png`。

## 已入库的首批来源

2026-10-24 核对小米官方招聘公开列表：官方脚本明确校招 type=2、实习 type=3。robots.txt 实测 404，页脚隐私政策不构成完整 JD 再分发授权，因此仅采集标题、城市、招聘类型、发布日期和官方详情链接。串行间隔至少 6.5 秒、每类型只取第一页 10 条；source 保持 disabled，无定时任务。

审核原始快照：`workers/artifacts/official-xiaomi-2026-10-24.json`，SHA-256 `742e3beb233ad618426cc9797cfd734d2652884be25a4147402cfd918dd392d0`。`scripts/load-official-jobs.mjs` 验证固定快照、来源域名和观测时间后单事务幂等导入；重复执行不增加岗位数。正式库只读核验：jobs=20，发布日期仅 date 精度=20，salary NULL=20，用户验收账号=0。来源/采集时间可由 API 和详情页读取。

## 业务接口增量

所有请求同源。私有写入先 GET `/api/v1/me` 获取 `X-CSRF-Token`，携带 HttpOnly 会话与 `Origin`。错误统一 `{error:{code,message,requestId}}`；401 重新登录，403 校验/权限，409 版本冲突，422 字段校验，429 限流，503 服务未配置。冲突不会覆盖旧记录，页面提供显式载入服务器版本并保留当前表单草稿。

| 路径 | 操作与合同 |
| --- | --- |
| `/api/v1/catalog` | GET，`{data:{companies,jobs,experiences,questions,chapters}}`；数据库为空返回空数组，无样本回退 |
| `/api/v1/jobs/import` | POST `{jobs:[…]}`，最多100条，真实来源链接/公司/届别/说明必填；批次全成功或回滚，标记手动未核验 |
| `/api/v1/workspace` | GET `{data:{records:{key:{value,version}}}}`，仅本人资源 |
| `/api/v1/workspace/records/{key}` | GET 单项；PUT `{value,expectedVersion}` → `{data:{value,version}}`。key与内容严格白名单，数据库资源各自成表，关系/归属在事务内校验 |
| `/api/v1/files` | GET 本人附件元数据列表 |
| `/api/v1/files/{id}` | PUT multipart `file`/可选`name`；GET 原始字节；DELETE。简历10MB、音频30MB；MIME/文件头/文件名/所有权校验 |
| `/api/v1/workspace/export?includeFiles=true` | GET 签名原生备份 `{data:backup}`，含 `stateVersion`；附件总量最多50MB，省略原件时恢复需现有相同原件 |
| `/api/v1/workspace/import` | POST `{backup,expectedVersion,confirm:"RESTORE"}`；同账号、签名、结构、外键、最新状态校验，单事务恢复，冲突/失败不部分覆盖 |
| `/api/v1/workspace/reset` | POST `{expectedVersion,confirm:"RESET"}`；仅清空当前账号私有记录；身份、公共招聘与已发布原创保留 |

核心投递、阶段移动/撤销、收藏、个人资料、宝典进度沿用原 OpenAPI。新增字段/四种收藏类型以 `apps/web/lib/api/contracts.ts` 为准；工作区各实体字段以 `apps/web/server/workspace-schema.ts` 中严格 Zod schema 为准。导出不含密码/会话；恢复不重放后台任务、不重新发布公共面经。附件随机存储名不可从 URL 推测。

## 使用与边界

本机 `npm run dev` → `http://127.0.0.1:3000`，先注册自己的账号。API 模式所有私有记录读取服务端，不自动迁移旧演示数据。无真实面经、题目、宝典、薪资时呈现空态；不会以虚构内容补数。真实模拟练习需要题库内容。匹配、摘要、复盘和诊断采用明确标注的输入规则分析；用户已于2026-10-24取消外部LLM、embedding及云端转写，不再计入待完成范围。外部推送、多人共享、密码找回/邮箱验证及云端部署仍待完成。
