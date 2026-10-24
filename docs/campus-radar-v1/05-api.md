# 05 MVP API 轻量初稿

版本：0.1。机器合同：[OpenAPI 3.1 JSON](openapi.json)。本版只定义 MVP；V2/V3 的 AI、订阅、社区与简历业务端点在相应阶段再写，避免误认为已上线。

当前实现与真实服务开通边界见 [交付状态](08-delivery-status.md)。公开 mock 读取、实际 PG 路径及受保护的私有端点已实现；真实 AI 和站点爬虫未开通，导出/账户删除保持503。

## 边界与约定

- 业务基址 `/api/v1`，Next.js Route Handlers 为唯一浏览器业务 API。Server Components 直调同一 service/repository，不绕本站 HTTP；必要的 Server Actions 复用 service，不另建一套业务逻辑。
- 内部同步 `/api/internal/v1`，由 Python 调用 Next.js；部署时只允许受控 worker 访问，服务端验签。
- 用户认证采用 Supabase Auth 的服务端 BFF 封装：浏览器只持不透明、HttpOnly、Secure、SameSite=Lax 会话 Cookie；不透明 token 的 hash 对应 AuthSession，供应商 refresh/access token 服务端加密保存。会话 7 天，按需轮换；浏览器不保存 provider token。身份服务调用错误不会假装登录成功。
- Cookie 写入操作验证 Origin/CSRF；登录/注册表单由服务端签发 double-submit token，已登录请求从 GET /me 的 X-CSRF-Token 响应头获取会话绑定 token，写请求在同名请求头带回。权限在每个 service 校验资源归属，不能只依赖 layout。User ID 一律从会话解析，不接受客户端指定 owner。
- 成功单条 `{data:...}`；列表 `{data:[],page:{nextCursor:null,hasMore:false},meta:{...}}`。时间 ISO 8601，JSON 字段 camelCase。
- 错误 `{error:{code,message,fieldErrors?,requestId}}`，requestId 同时出现在响应头。禁止返回堆栈、SQL、上游密钥。

## 分页、筛选与排序

- cursor 为服务端不透明的 keyset token，包含排序值/ID/筛选 hash/版本；limit 默认 20，最大 100。变更筛选必须重置 cursor；不匹配返回 422 INVALID_CURSOR，不悄悄混页。
- `sort=newest` 为 published_at DESC,id DESC；`deadline` 为 deadline_at ASC NULLS LAST,id ASC；显式 allowed sort，禁止任意 SQL 列名。
- 多值筛选逗号分隔、AND 连接维度、OR 连接同维度值；`city=上海,北京` 与 `role=frontend,backend`。q 先 trim，最多 100 字符；空查询返回默认列表。
- total 只在首批且 includeTotal=true 时返回，默认省略；total 与实际过滤一致。看板不是无限分页列表，返回最多 500 条 active 卡片，超出需筛选公司/阶段或归档，并返回 truncated=true。
- 收藏和内容搜索允许相关性排序，使用稳定的 rank+id；内容修改会改变排名，返回 snapshotAt 供 UI 提示。

## 接口清单

| 方法与路径 | 访问 | 请求重点 | 返回 |
| --- | --- | --- | --- |
| GET /auth/csrf | 匿名同源 | 无 | csrfToken，并设置 double-submit cookie |
| POST /auth/register | 匿名 | email,password,displayName | 202 verificationRequired；身份服务发送验证信 |
| GET /auth/callback（站点路由） | 验证链接 | 身份服务一次性 code、state；只接受站内 returnTo | 换取会话并 303 回跳；非 JSON API，详细规则见架构文档 |
| POST /auth/login | 匿名 | email,password | User + 设置 cookie |
| POST /auth/logout | 会话 | 空 | 204 撤销会话 |
| GET/PATCH /me | 会话 | 更新 displayName/preferences/theme/timezone/onboardingStep | User；首次 PATCH 保存引导进度 |
| POST /me/export | 会话 | 空；Idempotency-Key | 202 Task；只导出本人数据 |
| DELETE /me | 会话 | confirm="DELETE"；最近 10 分钟重新验证；Idempotency-Key | 202 receipt；冻结账户/撤销会话、异步清除 |
| GET /jobs | 公开 | q/city/companyId/role/education/recruitmentType/graduationYear/status/sort/cursor/limit | JobCard 列表 |
| GET /jobs/{id} | 公开 | UUID | 完整 Job、Company 基本资料 |
| GET /companies | 公开 | q/cursor/limit | 公司列表 |
| GET /companies/{id} | 公开 | UUID | 公司基本资料，岗位走 /jobs?companyId= |
| GET /search | 公开 | q/types/limit；MVP types=job,company,experience,handbook | 分组结果、站内 href、可预览标记 |
| GET /applications | 会话 | companyId/stage/view=board或list | 当前用户 active 看板/列表与统计 |
| POST /applications | 会话 | jobId；Idempotency-Key | 新建待投 201；已存在返回已有记录 200 |
| GET/PATCH /applications/{id} | 会话 | notes/appliedAt/archived/version | 单条；version 必填于 PATCH |
| POST /applications/{id}/move | 会话 | stage/orderingScope/beforeId?/afterId?/version/closedReason?；Idempotency-Key | 移动后记录+阶段事件；冲突409 |
| POST /applications/{id}/undo | 会话 | operationId/version；Idempotency-Key | 新反向事件与记录；只可撤销最近本人事件 |
| GET /experiences | 公开 | q/companyId/role/roundType/tag/cursor/limit | 已发布面经卡片 |
| GET /experiences/{id} | 公开 | UUID | 正文/摘要/来源；无权全文只返回合法摘要链接 |
| GET /handbook/chapters | 公开 | direction/q | 目录树数据 |
| GET /handbook/chapters/{slug} | 公开 | slug | 章节正文 |
| GET/PUT /handbook/progress/{chapterId} | 会话 | completed/note/version | 私有笔记与进度；首次 version=0 |
| GET /favorites | 会话 | type/cursor/limit | 收藏及目标摘要 |
| PUT/DELETE /favorites/{type}/{targetId} | 会话 | MVP type=job/experience/company | 幂等收藏/取消；PUT 返回 Favorite，DELETE204 |
| GET /tasks/{id} | 会话 | UUID | 仅本人可读 task 状态；导出成功返回限时 URL |
| POST /api/internal/v1/crawl/batches | worker | sourceId/runId/taskId/leaseToken/batchId/jobs[]/final | 幂等 upsert、统计、最终标记 |

表中除 callback 和 internal 外均相对 `/api/v1`。AI 引导动画、模拟面试等演示端点不加入 MVP OpenAPI；mock adapter 本地提供演示状态。

## 请求与响应示例

```json
{
  "stage": "INTERVIEW_1",
  "orderingScope": "stage",
  "beforeId": null,
  "afterId": "d3943988-8c54-4bcb-978f-a5910c1631b3",
  "version": 3
}
```

POST `/api/v1/applications/{id}/move` 同一事务校验资源归属、version、锚点的目标列和公司筛选范围，分配 sort_key，写 ApplicationStageEvent，并返回 version=4。orderingScope 默认 stage，表示整列顺序；company 表示当前卡片所属公司的该列子序列，邻居必须属于同公司。beforeId 表示紧邻其前，afterId 表示紧邻其后；两者同时传时必须在对应子序列相邻；均为空时放对应子序列末尾。其他临时筛选只隐藏卡片，不改变实际排序范围，UI 拖动提示按完整列顺序保存。排序键间隔不足时事务内重排。

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "这条投递已在其他窗口更新，请刷新后重试。",
    "requestId": "req_01"
  }
}
```

客户端 mutation 采用乐观更新；失败回滚并保留原草稿；409 展示新版本，不静默覆盖。撤销使用 operationId 和当前 version，最多 10 分钟且只针对最近一次可撤销事件，不能覆盖其他窗口后续修改。

## 鉴权、幂等与错误码

| HTTP | code | 行为 |
| --- | --- | --- |
| 400 | BAD_REQUEST / INVALID_JSON | 请求语法错误 |
| 401 | AUTH_REQUIRED / INVALID_CREDENTIALS / REAUTH_REQUIRED | 登录或重新验证；登录错误不透露邮箱是否存在 |
| 403 | CSRF_REJECTED / SOURCE_NOT_APPROVED / INVALID_WORKER_SIGNATURE | 不重试，修正调用权限 |
| 404 | NOT_FOUND | 无资源/无私有访问权使用相同响应 |
| 409 | VERSION_CONFLICT / IDEMPOTENCY_CONFLICT / UNDO_CONFLICT / LEASE_EXPIRED | 刷新或重新领取，禁止盲目覆写 |
| 422 | VALIDATION_ERROR / INVALID_CURSOR | 定位字段/重置分页 |
| 429 | RATE_LIMITED / QUOTA_EXCEEDED | Retry-After；可等待后重试 |
| 503 | UPSTREAM_UNAVAILABLE / SERVICE_UNAVAILABLE | 显式失败，不能落入 mock |
| 500 | INTERNAL_ERROR | requestId 关联服务端脱敏日志 |

Idempotency-Key 作用域为 user/worker + route，24h 保存请求 hash 与结果；相同请求重放原结果，同 key 不同载荷409。收藏 PUT/DELETE 自然幂等。看板写入、导出与删除要求幂等键。UI 预览和生产不自动互相回退。

初始速率策略：匿名读按可信边缘 IP 60次/分；登录失败 5次/15分，另结合账户标识限流；认证写 30次/分；导出 3次/天。多实例下不能只用内存计数；边缘限流加数据库计数，避免依赖可伪造请求头。

## worker 同步合同

任务由 PG Task 队列持久化，Python executor 领取租约后执行 Scrapy，不通过用户请求启动爬虫。批次回调只入库已标准化数据，每批最多 100 岗位/1MiB，不包含任意抓取 URL 指令。

验签头：X-Worker-Key-Id、X-Worker-Timestamp、X-Worker-Nonce、X-Worker-Signature；签名为 HMAC-SHA256(timestamp + newline + nonce + newline + method + newline + pathname + newline + sha256(rawBody))。时间窗 ±300 秒、nonce 10 分钟去重、常量时间比较；每次重试新 nonce，业务 batchId 保持相同。验签后检查 source 准入、Task/CrawlRun 关联及 leaseToken 未过期，过期 worker 不能提交。

unique(run_id,batch_id) 保证重放不重复写；最终批次标记 final=true，同一事务完成 CrawlRun/Task 汇总。部分失败只返回错误项和原因，不删除已有有效数据。来源临时失败不批量关闭岗位；官方明确关闭或连续 3 次完整成功采集未再出现才候选关闭，人工抽检。

## 范围内异步任务

MVP 任务仅为采集、本人数据导出、账户清除；提交立即返回202和资源引用。GET /tasks 以2s→5s→10s退避轮询，切后台暂停，终态停止。AI API 在后续阶段采用同一任务合同，不在 Next.js 请求中等待模型完成。
