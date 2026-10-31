# 接口开发说明

机器合同：[OpenAPI3.1](contracts/openapi.json)。后端已实现，182操作均有控制器映射。真实联调证据见HANDOFF。请求/返回DTO、必填项、长度、枚举、nullable和分页限制以合同为准。接口目录在本文末尾，路径省略统一前缀/api/v1。

## 评论发布、撤回与管理（2026-10-31 最新）

评论创建的幂等重试若命中旧服务器保存的PENDING快照，读取相同作者/主题的当前评论状态返回；不重建、不额外发布记录。该补偿只处理历史PENDING快照，正文和权限仍由现存记录决定。

社区和面经`POST .../comments`创建后直接PUBLISHED，回复同样直接公开。父主题必须公开，父评论必须是同主题的公开评论；身份、CSRF、幂等与2000字限制保留。`DELETE /me/comments/{commentId}?version=`仅USER撤回本人评论（原主题DELETE入口兼容），按作者与version条件更新body空串/status HIDDEN，不物理删除，保留回复关系。

`GET /admin/comments`仅ADMIN，分页返回PUBLISHED/HIDDEN评论；`DELETE /admin/comments/{id}`仅ADMIN，body为`CommentRemoval {version,reason}`。事务内再次验证角色、锁记录和版本，清除正文、HIDDEN并追加COMMENT_DELETE审计；普通用户/REVIEWER拒绝，重复清除409。举报保留，两种管理角色仍可对公开评论执行HIDE下架，但不再允许APPROVE/REJECT评论。

`GET /admin/moderation`只保留JOB/EXPERIENCE/QUESTION/CHAPTER/POST/REFERRAL/SALARY/SIGNAL八类，`type`按白名单筛选与真实total/hasMore；评论不进入待审计数。管理页跨模块10秒/前台/手动同步、暂停隐藏页面、弹窗保留意见和过期请求保护继续有效。

历史PENDING评论经用户明确授权已在本机转换1条为PUBLISHED，并逐条追加actor_id=NULL的COMMENT_POLICY_PUBLISH系统审计；HIDDEN/已删除评论未动。无需改表，其他环境如需相同过渡须明确授权后执行`migrations/2026-10-31-comments-direct-publish.sql`。先加载新后端，避免旧进程继续产生PENDING。

## 本人投稿查询

2026-10-30修正MySQL8.4联合投影：仅`public_path`六分支统一`CAST(... AS CHAR(128))`，消除ASCII拼接与UTF8字面量1267冲突，不改表排序规则、id/status排序或作者过滤。实际MySQL只读空作者126种过滤/分页组合与常量中文/emoji/null/路径验证通过；H2测试不替代此项检查。

`GET /api/v1/me/submissions`（USER）返回当前会话作者的六类投稿摘要，绝不接受其他作者ID作为查询条件。`type`可选POST/EXPERIENCE/SALARY/REFERRAL/POST_COMMENT/EXPERIENCE_COMMENT；`status`可选DRAFT/PENDING/PUBLISHED/REJECTED/HIDDEN；page1–500、size1–100默认20。响应包含实际total/hasMore、创建/更新时间、version、中文界面所需标题摘要与可选本人详情；不返回他人记录或审核员内部字段。只有公开目标仍可见时提供publicPath，匿名薪资仅聚合展示，无单条公开链接。未知类型/状态/越界分页422，匿名401，管理角色403。现有数据表只读聚合，无数据库迁移。 POST_COMMENT额外返回可选commentContext：body为本人评论全文，postId/postSummary/postAvailable/postPath附原帖上下文，parentId/parentBody附回复对象。仅补充当前页本人评论；原帖摘要仅公开或本人原帖可见，公开链接仅原帖PUBLISHED时提供（不要求本人评论已发布）；他人非公开原评论正文不返回，同帖父评论关联校验。旧UNION public_path的CHAR(128)排序规则兼容处理保留，不新增表。

## 1. HTTP约定

- 同源REST/JSON；UTF-8；JSON字段camelCase。API不直接返回数据库Entity，不提供全账号JSON任意写接口。
- 单条成功`{data:{...},requestId:"..."}`；分页成功`{data:[...],page:{page:1,size:20,total:0,hasMore:false},requestId:"..."}`；无内容成功204。创建一般201；异步受理202；加入投递首次/重复均200。
- 错误`{error:{code,message,requestId,fieldErrors?:[{field,message}]}}`；不能用HTTP200包装错误。响应含X-Request-Id，日志用同编号；不返回SQL、堆栈、路径和凭据。
- UUID是字符串；version整数；日期YYYY-MM-DD，时间ISO8601 UTC，例如2026-10-27T01:00:00.000Z；DECIMAL排序键是字符串。
- PATCH只修改明确出现的字段；省略保持原值，只有nullable字段可用null清空。version必填且至少一个业务字段，纯version请求422。未知字段拒绝422。
- 请求体普通JSON≤512KiB；q≤100字符；数组/字符串上限见schema。HTTP/HTTPS链接和IANA timezone由服务端额外校验。
- 列表page默认1、size默认20最大100、page最大500；排序白名单，不接受SQL列名。jobs多值city/role/education逗号分隔，最多20值；不同维AND，同维OR；jobs.q空值为无搜索，非空不足2字符422。search.q必须2–100字符，types限定JOB/COMPANY/EXPERIENCE/QUESTION/CHAPTER（逗号分隔），limit默认20最大50。
- 全部会话、私人接口和错误响应Cache-Control:no-store。公共缓存仅服务器Redis受控数据缓存，浏览器不缓存个性化信息。

## 2. 会话、CSRF与权限

1. 前端GET /auth/csrf，credentials=include；服务器必要时建立匿名SESSION，返回`{data:{token,headerName:"X-CSRF-TOKEN"},requestId}`。
2. 注册、登录、找回、重置等匿名写也携带SESSION与X-CSRF-TOKEN。后端检查Origin严格等于APP_ORIGIN，代理不信任任意转发头。
3. 登录成功轮换会话ID，SESSION为HttpOnly、Secure（生产）、SameSite=Lax、Path=/；新账号注册即为ACTIVE，无需邮箱验证即可登录；冻结、停用、注销中账号仍拒绝登录。密码Argon2id，长度12–128字符；登录错误不透露账号是否存在。
4. 登录/退出后旧CSRF令牌失效；客户端重取/auth/csrf。令牌只在内存，不放URL、localStorage或日志。[Spring Security SPA与CSRF说明](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html)
5. 空闲会话30分钟、绝对7天；每次认证核对账号状态与auth_version，修改/重置密码使旧会话全部无效。退出当前会话204，前端清空私人缓存并重新加载匿名CSRF。
6. /auth/reauth成功建立当前会话10分钟的重新验证窗口；导入apply、清空、注销必需。改密码本身校验currentPassword，不复用任意过期窗口。

资源归属从当前用户取得，客户端不能传ownerId控制记录归属。私有资源不存在或不属于本人一律404；缺角色403。房间成员、内推申请参与者与提供者认证是额外关系条件，不能只看USER角色。

密码重置token为32字节安全随机数，库内只存SHA-256，单次原子消费，30分钟有效。邮件链接前端读取后等待用户POST提交，GET不消耗token，避免邮箱扫描器误触发。注册/找回返回统一202，verificationRequired固定为false；注册不生成令牌或发送邮件，找回邮件失败进入可重试投递，不伪造“已送达”。邮箱验证与重发接口已移除，旧前端链接跳转登录。emailVerified仅保留历史事实，不作为登录或邮件订阅条件。

## 3. 并发与幂等

有Idempotency-Key参数的操作必须携带16–80字符键。作用域为userId+HTTP方法+规范资源路径，保留24小时；请求hash按规范化JSON生成，上传按规范化purpose+文件SHA-256生成，不把multipart随机boundary算入hash。

同键同内容重放原HTTP状态与业务响应；同键不同内容409 IDEMPOTENCY_CONFLICT。处理中同键409 REQUEST_IN_PROGRESS；客户端保留键并退避重试，不能另造键重复创建。匿名账号接口不使用此表，靠令牌/邮箱唯一约束、统一受理与限流处理。自然幂等的收藏/点赞PUT和DELETE不额外要求键。

PUT首次创建学习进度/复盘/Offer比较时version=0（章节/题目进度和复盘未建立时GET返回404，Offer比较未建立时GET返回version=0的空配置），否则携带最近读到的version；更新后+1。DELETE可编辑实体时通过?version=携带，收藏/点赞例外。

看板move携带卡片version+boardVersion+stage，撤销再携带operationId；成功返回application、boardVersion、operationId。409不静默覆盖；重取看板和历史，保留笔记草稿，用户确认再操作。board.truncated=true时禁止排序。

## 4. 关键示例

移动至一面，放在目标卡前：

```http
POST /api/v1/applications/11111111-1111-4111-8111-111111111111/move
Content-Type: application/json
X-CSRF-TOKEN: <当前会话令牌>
Idempotency-Key: move-20261027-000001
```

```json
{"version":3,"boardVersion":8,"stage":"INTERVIEW_1","beforeId":"22222222-2222-4222-8222-222222222222","afterId":null}
```

冲突响应HTTP409：

```json
{"error":{"code":"VERSION_CONFLICT","message":"记录已更新，请载入服务器版本。","requestId":"req-example-01"}}
```

保存章节笔记首次请求：

```http
PUT /api/v1/handbook/progress/33333333-3333-4333-8333-333333333333
Content-Type: application/json
X-CSRF-TOKEN: <当前会话令牌>
```

```json
{"version":0,"completed":false,"note":"需要复习事务隔离","chapterVersion":1}
```

文件上传POST /files使用multipart字段purpose和file，返回File元数据；GET /files/{id}/download返回原始字节，不包JSON。Content-Disposition使用attachment和安全文件名；PDF预览由前端下载字节交PDF.js，后端不把私有文件放静态public目录。

## 5. 错误与客户端动作

| HTTP | code | 客户端动作 |
| --- | --- | --- |
| 400 | BAD_REQUEST / INVALID_JSON | 显示格式错误，不盲目重试 |
| 401 | AUTH_REQUIRED / INVALID_CREDENTIALS / REAUTH_REQUIRED | 清理失效会话状态或重新验证；保留本地草稿 |
| 403 | FORBIDDEN / CSRF_REJECTED / ACCOUNT_INACTIVE | 显示权限/账号状态提示；CSRF失效重取后由用户重试写入 |
| 404 | NOT_FOUND | 无资源或私有越权同响应 |
| 409 | VERSION_CONFLICT / BOARD_CONFLICT / UNDO_CONFLICT | 重载服务器版本，保留草稿 |
| 409 | IDEMPOTENCY_CONFLICT / REQUEST_IN_PROGRESS | 检查键/载荷；处理中用原键退避重试 |
| 409 | FILE_IN_USE / ROOM_FULL / INVALID_STATE / DATA_LOCKED | 解释当前业务状态，不强行覆盖 |
| 413 / 415 | PAYLOAD_TOO_LARGE / UNSUPPORTED_MEDIA_TYPE | 调整文件，不重试原请求 |
| 422 | VALIDATION_ERROR / Q_TOO_SHORT | 字段级提示；语法正确但值非法 |
| 429 | RATE_LIMITED | 按Retry-After等待 |
| 500 / 503 | INTERNAL_ERROR / DEPENDENCY_UNAVAILABLE | 显示请求编号和重试；不能回退为假数据 |

初始限额：匿名读60次/分钟/IP；登录失败5次/15分钟/邮箱摘要+IP；认证写60次/分钟/用户；找回5次/小时；导出3次/日；上传20次/小时。Redis Lua保证原子计数，反代仅接受受信任代理的客户端地址。

## 6. 内容与任务的特殊合同

- 公开列表只返回PUBLISHED；本人草稿用/me/experiences、/me/posts。公开详情存在但未发布且不是本人时404。
- 来源登记/许可/启停由ADMIN管理；来源停用后的岗位不再对公众展示，私人投递仅保留标题、公司、来源链接及失效说明（正文清空，薪资/截止未知）。公司基础资料ADMIN直接维护；其它公开内容提交审核。审核记录version、decision、reason，审批与审计同事务；报告处理不隐式替代下架，需显式审核动作。
- 审核完整内容通过 `GET /admin/moderation/{type}/{id}` 获取 `ModerationDetail`（审核项与对应公开资源DTO）。REVIEWER/ADMIN可查看待审核正文与最新版本，不能借此访问邮箱、密码、私人附件、投递或申请；客户端先读详情再提交审核，版本变化时409并重新获取。评论不再进行前置审核；下架仍记为HIDDEN，原因保存在审计中。
- 202表示任务和Outbox在MySQL已持久化；MQ暂不可用可排队，任务结果仍未完成。GET /tasks/{id}只读本人；2s→5s→10s轮询，后台暂停，终态停止。
- 注销后会话已撤销，受理任务ID仅作为回执，不能因此匿名查询私有任务；失败由ADMIN服务管理重试。
- 提供者认证verified=true须validUntil为未来时间，过期实时视为未认证；撤销时validUntil置null。内推申请accepted只代表提供者接受申请；房间任务进度只属于当前成员，不接受请求体里的任意userId。
- 内容管理录入只负责人工录入/审核；不保留旧内部爬虫批次、OAuth callback、catalog全量快照与workspace任意记录接口。

## 7. 全部接口目录

访问PUBLIC允许匿名；USER包括本人/成员关系；REVIEWER与ADMIN按角色再查业务边界。请求/返回名称均是OpenAPI中的schema；无请求体标“—”，无返回体标204，列表返回分页或明确数组。

### 账号

| 方法与路径 | 请求 | 返回 | 访问 |
| --- | --- | --- | --- |
| `GET /auth/csrf` | — | 200 Csrf | PUBLIC |
| `POST /auth/register` | RegisterInput | 202 RegistrationResult | PUBLIC |
| `POST /auth/forgot-password` | EmailInput | 202 RegistrationResult | PUBLIC |
| `POST /auth/reset-password` | ResetPasswordInput | 200 Ack | PUBLIC |
| `POST /auth/login` | LoginInput | 200 User | PUBLIC |
| `POST /auth/logout` | — | 204 204 | USER |
| `POST /auth/reauth` | ReauthInput | 200 ReauthResult | USER |
| `PUT /auth/password` | PasswordInput | 200 Ack | USER |
| `GET /me` | — | 200 User | USER |
| `PATCH /me` | UserPatch | 200 User | USER |
| `GET /me/overview` | — | 200 Overview | USER |
| `GET /favorites` | — | 200 Favorite | USER |
| `PUT /favorites/{type}/{id}` | — | 200 Favorite | USER |
| `DELETE /favorites/{type}/{id}` | — | 204 204 | USER |
| `GET /account/data-revision` | — | 200 DataRevision | USER |
| `POST /account/exports` | ExportInput；幂等键 | 202 Task | USER |
| `POST /account/import-previews` | ImportInput；幂等键 | 201 ImportPreview | USER |
| `POST /account/import-previews/{id}/apply` | ImportApply；幂等键 | 202 Task | USER |
| `POST /account/reset` | ResetInput；幂等键 | 202 Task | USER |
| `DELETE /me` | EraseInput；幂等键 | 202 Task | USER |

### 发现

| 方法与路径 | 请求 | 返回 | 访问 |
| --- | --- | --- | --- |
| `GET /public/stats` | — | 200 LandingStats | PUBLIC |
| `GET /jobs` | — | 200 Job | PUBLIC |
| `GET /jobs/{id}` | — | 200 Job | PUBLIC |
| `GET /jobs/{id}/match` | — | 200 MatchResult | USER |
| `GET /companies` | — | 200 Company | PUBLIC |
| `GET /companies/{id}` | — | 200 Company | PUBLIC |
| `GET /companies/by-slug/{companySlug}/style` | — | 200 CompanyStyle | PUBLIC |
| `GET /search` | — | 200 SearchResult | PUBLIC |

### 知识

| 方法与路径 | 请求 | 返回 | 访问 |
| --- | --- | --- | --- |
| `GET /companies/by-slug/{companySlug}/pack` | — | 200 CompanyPack | PUBLIC |
| `GET /experiences` | — | 200 Experience | PUBLIC |
| `GET /experiences/{id}` | — | 200 Experience | PUBLIC |
| `GET /me/experiences` | — | 200 Experience | USER |
| `POST /experiences` | ExperienceInput；幂等键 | 201 Experience | USER |
| `PATCH /experiences/{id}` | ExperiencePatch | 200 Experience | USER |
| `DELETE /experiences/{id}` | — | 204 204 | USER |
| `POST /experiences/{id}/submit` | VersionInput | 200 Experience | USER |
| `GET /experiences/{id}/comments` | — | 200 Comment | PUBLIC |
| `POST /experiences/{id}/comments` | CommentInput；幂等键 | 201 Comment | USER |
| `DELETE /experiences/{id}/comments/{commentId}` | — | 204 204 | USER |
| `GET /questions` | — | 200 Question | PUBLIC |
| `GET /questions/{id}` | — | 200 Question | PUBLIC |
| `GET /questions/{id}/progress` | — | 200 QuestionProgress | USER |
| `PUT /questions/{id}/progress` | QuestionProgressPut | 200 QuestionProgress | USER |
| `GET /handbook/chapters` | — | 200 数组 | PUBLIC |
| `GET /handbook/chapters/{slug}` | — | 200 Chapter | PUBLIC |
| `GET /handbook/progress/{id}` | — | 200 ChapterProgress | USER |
| `PUT /handbook/progress/{id}` | ChapterProgressPut | 200 ChapterProgress | USER |

### 投递

| 方法与路径 | 请求 | 返回 | 访问 |
| --- | --- | --- | --- |
| `GET /applications/board` | — | 200 Board | USER |
| `GET /applications` | — | 200 Application | USER |
| `POST /applications` | ApplicationCreate；幂等键 | 200 ApplicationMutation | USER |
| `GET /applications/{id}` | — | 200 Application | USER |
| `PATCH /applications/{id}` | ApplicationPatch | 200 ApplicationMutation | USER |
| `GET /applications/{id}/history` | — | 200 StageEvent | USER |
| `POST /applications/{id}/move` | ApplicationMove；幂等键 | 200 ApplicationMutation | USER |
| `POST /applications/{id}/undo` | ApplicationUndo；幂等键 | 200 ApplicationMutation | USER |
| `GET /analytics` | — | 200 Analytics | USER |

### 面试

| 方法与路径 | 请求 | 返回 | 访问 |
| --- | --- | --- | --- |
| `GET /calendar/events` | — | 200 CalendarEvent | USER |
| `POST /calendar/events` | EventInput；幂等键 | 201 CalendarEvent | USER |
| `PATCH /calendar/events/{id}` | EventPatch | 200 CalendarEvent | USER |
| `DELETE /calendar/events/{id}` | — | 204 204 | USER |
| `GET /calendar/export` | — | 204 原始文件 | USER |
| `GET /applications/{id}/rounds` | — | 200 数组 | USER |
| `POST /applications/{id}/rounds` | RoundInput；幂等键 | 201 InterviewRound | USER |
| `PATCH /rounds/{id}` | RoundPatch | 200 InterviewRound | USER |
| `DELETE /rounds/{id}` | — | 204 204 | USER |
| `GET /rounds/{id}/review` | — | 200 InterviewReview | USER |
| `PUT /rounds/{id}/review` | ReviewPut | 200 InterviewReview | USER |

### 文件

| 方法与路径 | 请求 | 返回 | 访问 |
| --- | --- | --- | --- |
| `GET /files` | — | 200 File | USER |
| `POST /files` | FileUpload；幂等键 | 201 File | USER |
| `GET /files/{id}/download` | — | 204 原始文件 | USER |
| `DELETE /files/{id}` | — | 204 204 | USER |

### 简历

| 方法与路径 | 请求 | 返回 | 访问 |
| --- | --- | --- | --- |
| `GET /resumes` | — | 200 Resume | USER |
| `POST /resumes` | ResumeInput；幂等键 | 201 Resume | USER |
| `PATCH /resumes/{id}` | ResumePatch | 200 Resume | USER |
| `DELETE /resumes/{id}` | — | 204 204 | USER |
| `GET /resumes/diff` | — | 200 ResumeDiff | USER |
| `POST /resume-diagnoses` | DiagnosisInput | 200 RuleReport | USER |

### 社区

| 方法与路径 | 请求 | 返回 | 访问 |
| --- | --- | --- | --- |
| `GET /posts/{id}/comments` | — | 200 Comment | PUBLIC |
| `POST /posts/{id}/comments` | CommentInput；幂等键 | 201 Comment | USER |
| `DELETE /posts/{id}/comments/{commentId}` | — | 204 204 | USER |
| `GET /posts` | — | 200 Post | PUBLIC |
| `GET /me/submissions` | type/status/page/size；仅本人 | 200 SubmissionSummary分页 | USER |
| `GET /me/posts` | — | 200 Post | USER |
| `POST /posts` | PostInput；幂等键 | 201 Post | USER |
| `PATCH /posts/{id}` | PostPatch | 200 Post | USER |
| `DELETE /posts/{id}` | — | 204 204 | USER |
| `PUT /posts/{id}/like` | — | 200 Ack | USER |
| `DELETE /posts/{id}/like` | — | 204 204 | USER |

### 练习

| 方法与路径 | 请求 | 返回 | 访问 |
| --- | --- | --- | --- |
| `GET /mock-sessions` | — | 200 MockSession | USER |
| `POST /mock-sessions` | MockInput；幂等键 | 201 MockSession | USER |
| `GET /mock-sessions/{id}` | — | 200 MockSession | USER |
| `PATCH /mock-sessions/{id}` | MockAction；幂等键 | 200 MockSession | USER |
| `PUT /mock-sessions/{id}/answers/{answerId}` | AnswerPut | 200 MockAnswer | USER |

### 成长

| 方法与路径 | 请求 | 返回 | 访问 |
| --- | --- | --- | --- |
| `GET /planner/tasks` | — | 200 PlanTask | USER |
| `POST /planner/tasks` | PlanTaskInput；幂等键 | 201 PlanTask | USER |
| `PATCH /planner/tasks/{id}` | PlanTaskPatch | 200 PlanTask | USER |
| `DELETE /planner/tasks/{id}` | — | 204 204 | USER |
| `POST /planner/generate` | GeneratePlan；幂等键 | 200 数组 | USER |
| `GET /offers` | — | 200 Offer | USER |
| `POST /offers` | OfferInput；幂等键 | 201 Offer | USER |
| `PATCH /offers/{id}` | OfferPatch | 200 Offer | USER |
| `DELETE /offers/{id}` | — | 204 204 | USER |
| `GET /offer-comparison` | — | 200 Comparison | USER |
| `PUT /offer-comparison` | ComparisonPut | 200 Comparison | USER |
| `GET /salary/summary` | — | 200 SalarySummary | PUBLIC |
| `POST /salary/reports` | SalaryInput；幂等键 | 201 SalaryReport | USER |

### 订阅

| 方法与路径 | 请求 | 返回 | 访问 |
| --- | --- | --- | --- |
| `GET /subscriptions` | — | 200 Subscription | USER |
| `POST /subscriptions` | SubscriptionInput；幂等键 | 201 Subscription | USER |
| `PATCH /subscriptions/{id}` | SubscriptionPatch | 200 Subscription | USER |
| `DELETE /subscriptions/{id}` | — | 204 204 | USER |
| `POST /subscriptions/{id}/scan` | —；幂等键 | 202 Task | USER |
| `GET /subscriptions/{id}/hits` | — | 200 SubscriptionHit | USER |

### 通知

| 方法与路径 | 请求 | 返回 | 访问 |
| --- | --- | --- | --- |
| `GET /notifications` | — | 200 Notification | USER |
| `PATCH /notifications/{id}` | NotificationPatch | 200 Notification | USER |
| `DELETE /notifications/{id}` | — | 204 204 | USER |
| `POST /notifications/read-all` | —；幂等键 | 200 Ack | USER |

### 内推

| 方法与路径 | 请求 | 返回 | 访问 |
| --- | --- | --- | --- |
| `GET /referrals` | — | 200 Referral | PUBLIC |
| `POST /referrals` | ReferralInput；幂等键 | 201 Referral | USER |
| `POST /referrals/{id}/requests` | ReferralRequestInput；幂等键 | 201 ReferralRequest | USER |
| `GET /referral-requests` | — | 200 ReferralRequest | USER |
| `PATCH /referral-requests/{id}` | ReferralRequestPatch | 200 ReferralRequest | USER |

### 组队

| 方法与路径 | 请求 | 返回 | 访问 |
| --- | --- | --- | --- |
| `GET /buddy/rooms` | — | 200 BuddyRoom | USER |
| `POST /buddy/rooms` | RoomInput；幂等键 | 201 BuddyRoom | USER |
| `GET /buddy/rooms/{id}/members` | — | 200 数组 | USER |
| `POST /buddy/rooms/{id}/join` | —；幂等键 | 200 RoomMember | USER |
| `POST /buddy/rooms/{id}/leave` | —；幂等键 | 200 Ack | USER |
| `POST /buddy/rooms/{id}/close` | VersionInput；幂等键 | 200 BuddyRoom | USER |
| `POST /buddy/rooms/{id}/invitations` | InviteInput；幂等键 | 201 Invitation | USER |
| `GET /buddy/invitations` | — | 200 Invitation | USER |
| `PATCH /buddy/invitations/{id}` | InviteAction | 200 Invitation | USER |
| `GET /buddy/rooms/{id}/tasks` | — | 200 数组 | USER |
| `POST /buddy/rooms/{id}/tasks` | RoomTaskInput；幂等键 | 201 RoomTask | USER |
| `PUT /buddy/rooms/{id}/tasks/{taskId}/progress` | RoomTaskProgress | 200 Ack | USER |
| `GET /buddy/candidates` | — | 200 BuddyCandidate | USER |

### 情报

| 方法与路径 | 请求 | 返回 | 访问 |
| --- | --- | --- | --- |
| `GET /radar/signals` | — | 200 RadarSignal | PUBLIC |

### 审核

| 方法与路径 | 请求 | 返回 | 访问 |
| --- | --- | --- | --- |
| `POST /reports` | ReportInput；幂等键 | 201 Report | USER |

### 任务

| 方法与路径 | 请求 | 返回 | 访问 |
| --- | --- | --- | --- |
| `GET /tasks/{id}` | — | 200 Task | USER |

### 管理

| 方法与路径 | 请求 | 返回 | 访问 |
| --- | --- | --- | --- |
| `GET /admin/companies` | — | 200 Company | REVIEWER |
| `POST /admin/companies` | CompanyInput；幂等键 | 201 Company | ADMIN |
| `GET /admin/jobs` | — | 200 Job | REVIEWER |
| `POST /admin/jobs` | JobInput；幂等键 | 201 Job | ADMIN |
| `GET /admin/questions` | — | 200 Question | REVIEWER |
| `POST /admin/questions` | QuestionInput；幂等键 | 201 Question | ADMIN |
| `GET /admin/chapters` | — | 200 Chapter | REVIEWER |
| `POST /admin/chapters` | ChapterInput；幂等键 | 201 Chapter | ADMIN |
| `GET /admin/signals` | — | 200 RadarSignal | REVIEWER |
| `POST /admin/signals` | SignalInput；幂等键 | 201 RadarSignal | ADMIN |
| `PATCH /admin/jobs/{id}` | JobPatch | 200 Job | ADMIN |
| `GET /admin/moderation` | — | 200 ModerationItem | REVIEWER |
| `GET /admin/moderation/{type}/{id}` | — | 200 ModerationDetail | REVIEWER |
| `POST /admin/moderation/{type}/{id}/decisions` | ModerationDecision；幂等键 | 200 ModerationItem | REVIEWER |
| `GET /admin/reports` | — | 200 Report | REVIEWER |
| `PATCH /admin/reports/{id}` | ReportDecision | 200 Report | REVIEWER |
| `GET /admin/audit-logs` | — | 200 AuditLog | ADMIN |
| `GET /admin/services` | — | 200 ServiceHealth | ADMIN |
| `GET /admin/tasks` | — | 200 Task | ADMIN |
| `POST /admin/tasks/{id}/retry` | —；幂等键 | 200 Task | ADMIN |
| `PATCH /admin/companies/{id}` | CompanyPatch | 200 Company | ADMIN |
| `PATCH /admin/questions/{id}` | QuestionPatch | 200 Question | ADMIN |
| `PATCH /admin/chapters/{id}` | ChapterPatch | 200 Chapter | ADMIN |
| `PATCH /admin/signals/{id}` | SignalPatch | 200 RadarSignal | ADMIN |
| `PUT /admin/users/{id}/provider-certification` | ProviderDecision | 200 User | ADMIN |
| `GET /admin/sources` | — | 200 SourceAdmin | ADMIN |
| `POST /admin/sources` | SourceInput；幂等键 | 201 SourceAdmin | ADMIN |
| `PATCH /admin/sources/{id}` | SourcePatch | 200 SourceAdmin | ADMIN |

## 角色与连接状态约定

API 合同的 `x-access` 是后端中央角色边界的来源，`ACCOUNT` 表示共享账号能力，不代表任何求职功能。USER 与 ADMIN/REVIEWER 的权限不互相继承；未登记接口默认拒绝。新增 `/api/v1/admin/users` 查询和版本化编辑，以及管理员面经目录 `/api/v1/admin/experiences`。安全投影与字段约束以 OpenAPI 为准。

前端不以旧页面状态作为服务仍可用的证据：首页与账号状态在可见时每10秒复核，并在窗口聚焦时重连。请求失败立即清除不可验证的统计/目录/账号状态；后台内容不可用时隐藏旧页面内容。显示最近成功同步时间，不使用虚构数据或零值冒充真实统计。
