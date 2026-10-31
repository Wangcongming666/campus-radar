# 页面与接口映射

前端原39个入口中，邮箱验证与重发验证旧路径改为跳转登录。:id是UUID；:companySlug是稳定公司slug，统一替换旧文档中的含糊:company。API路径在本表省略/api/v1前缀。下表描述当前页面功能，实际验证范围见 [最新交接](HANDOFF.md)。

| 页面 | 访问 | 布局与交互 | 主要接口 |
| --- | --- | --- | --- |
| `/` 落地页 | PUBLIC | Hero→实际统计→功能分区→产品预览位→Offer故事标识→FAQ；图片缺失时保留版式并标待补素材。 | `GET /public/stats` |
| `/login` 登录 | PUBLIC | 邮箱密码表单、错误、站内returnTo、忘记密码；成功更新会话并重取CSRF。 | `GET /auth/csrf`<br>`POST /auth/login` |
| `/register` 注册 | PUBLIC | 共享认证布局、星轨动画、昵称/邮箱/密码/确认密码；与登录平滑切换，后端受理后展示注册完成与前往登录入口，无需邮箱验证。 | `GET /auth/csrf`<br>`POST /auth/register` |
| `/forgot-password` 找回密码 | PUBLIC | 提交邮箱，统一受理提示，不透露账号是否存在。 | `POST /auth/forgot-password` |
| `/reset-password` 重置密码 | PUBLIC | 从链接读取token但不发起GET写入；用户提交新密码后撤销旧会话。 | `POST /auth/reset-password` |
| `/onboarding` 四步引导 | USER | 身份→简历可跳过→偏好→准备时间轴；逐步保存，返回不丢稿；接入简历及规则生成。 | `GET /me`<br>`PATCH /me`<br>`POST /planner/generate` |
| `/jobs` 岗位广场 | PUBLIC | 标题/总量/更新时间；240px筛选侧栏+列表；列表/卡片/表格；收藏、Drawer、加入待投。 | `GET /jobs`<br>`PUT /favorites/{type}/{id}`<br>`POST /applications` |
| `/jobs/:id` 岗位详情 | PUBLIC | JD主栏+公司/条件侧栏；来源、日期精度、收藏、官方投递、关联面经；显示规则依据。 | `GET /jobs/{id}`<br>`GET /jobs/{id}/match`<br>`GET /experiences` |
| `/company/:id` 公司详情 | PUBLIC | 公司概览、标签页、岗位、相关知识；未知风格薪资显示来源不足。 | `GET /companies/{id}`<br>`GET /jobs`<br>`GET /salary/summary` |
| `/subscriptions` 岗位订阅 | USER | 订阅条件、启停、站内/邮件偏好、手动扫描、命中记录和任务进度。 | `GET /subscriptions`<br>`POST /subscriptions`<br>`PATCH /subscriptions/{id}`<br>`POST /subscriptions/{id}/scan`<br>`GET /subscriptions/{id}/hits` |
| `/referral` 内推 | PUBLIC | 公开有效内推列表+登录后申请/我的回执；认证提供者管理收到的申请。 | `GET /referrals`<br>`POST /referrals/{id}/requests`<br>`GET /referral-requests` |
| `/pipeline` 投递看板 | USER | 4张实际统计卡、8列横向看板、公司分组、卡片详情/笔记/历史、拖拽/菜单移动、归档恢复和撤销。 | `GET /applications/board`<br>`GET /applications`<br>`PATCH /applications/{id}`<br>`POST /applications/{id}/move`<br>`POST /applications/{id}/undo`<br>`GET /applications/{id}/history` |
| `/calendar` 求职日程 | USER | 月/周/列表视图、事件CRUD、关联轮次、时区、冲突提示、ICS导出。 | `GET /calendar/events`<br>`POST /calendar/events`<br>`PATCH /calendar/events/{id}`<br>`GET /calendar/export` |
| `/analytics` 投递分析 | USER | 时间范围、历史漏斗、阶段/日期分布、简历版本效果、样本/分母、客户端CSV。 | `GET /analytics` |
| `/resumes` 简历库 | USER | 上传/Canvas预览/文本、版本列表、默认版本、diff、下载、删除与投递关联。 | `POST /files`<br>`GET /resumes`<br>`POST /resumes`<br>`PATCH /resumes/{id}`<br>`GET /resumes/diff`<br>`GET /files/{id}/download` |
| `/interview/:id/timeline` 面试时间线 | USER | id为投递ID；轮次列表、增加/编辑/删除、日程与复盘入口。 | `GET /applications/{id}/rounds`<br>`POST /applications/{id}/rounds`<br>`PATCH /rounds/{id}` |
| `/interview/:id/review` 面试复盘 | USER | id仍是投递ID，?round=轮次ID；手动转写、录音回放、自评与笔记，空轮次给引导。 | `GET /applications/{id}/rounds`<br>`GET /rounds/{id}/review`<br>`PUT /rounds/{id}/review`<br>`POST /files` |
| `/mock` 模拟面试 | USER | 配置题库/时长、计时/暂停/恢复、逐题答题、自评、规则反馈、历史。 | `GET /mock-sessions`<br>`POST /mock-sessions`<br>`PATCH /mock-sessions/{id}`<br>`PUT /mock-sessions/{id}/answers/{answerId}` |
| `/style/:companySlug` 公司面试风格 | PUBLIC | 公司slug参数；样本量/时间窗、轮次分布、关键词/高频题，缺样本不画伪雷达。 | `GET /companies/by-slug/{companySlug}/style` |
| `/experiences` 面经列表 | PUBLIC | 结构化公开内容列表、公司/方向/轮次筛选及真实分页；“写面经”弹窗保存私人草稿，本人投稿由独立子路由管理。 | `GET /experiences`<br>`GET /me/experiences`<br>`POST /experiences`<br>`POST /experiences/{id}/submit` |
| `/experiences/:id` 面经详情 | PUBLIC | 限宽标题/摘要/安全Markdown正文/来源，面试信息侧栏与页内导航；评论真实分页、作者标识、引用回复和弹窗发送。 | `GET /experiences/{id}`<br>`GET /experiences/{id}/comments`<br>`POST /experiences/{id}/comments`<br>`POST /reports` |
| `/questions` 面试题库 | PUBLIC | 方向/难度/公司筛选，?question=题目ID深链接，参考答案、练习、自评、错题和掌握度。 | `GET /questions`<br>`GET /questions/{id}`<br>`GET /questions/{id}/progress`<br>`PUT /questions/{id}/progress` |
| `/handbook` 求职宝典 | PUBLIC | 目录树+章节正文+可折叠私有笔记；?chapter=slug#section；完成进度、阅读导出。 | `GET /handbook/chapters`<br>`GET /handbook/chapters/{slug}`<br>`GET /handbook/progress/{id}`<br>`PUT /handbook/progress/{id}` |
| `/pack/:companySlug` 公司面经包 | PUBLIC | 公司slug参数；关联面经、题目、知识章节集合，提供内容跳转和各目标收藏。 | `GET /companies/by-slug/{companySlug}/pack` |
| `/resume-check` 简历规则检查 | USER | 选择本人简历、关联岗位、规则问题/证据/建议、文本导出；不编造改写经历。 | `GET /resumes`<br>`POST /resume-diagnoses` |
| `/planner` 求职规划 | USER | 时间轴/里程碑、任务看板、增改删、到期提醒；规则生成不覆盖手动任务。 | `GET /planner/tasks`<br>`POST /planner/tasks`<br>`PATCH /planner/tasks/{id}`<br>`POST /planner/generate` |
| `/salary` 薪资参考 | PUBLIC | 公司/岗位/城市/年份筛选、样本量、聚合图；用户匿名投稿经审核后纳入。 | `GET /salary/summary`<br>`POST /salary/reports` |
| `/offer-compare` Offer对比 | USER | 多Offer编辑、明确现金年化、维度权重、缺失覆盖率、排序/说明及CSV导出。 | `GET /offers`<br>`POST /offers`<br>`PATCH /offers/{id}`<br>`GET /offer-comparison`<br>`PUT /offer-comparison` |
| `/community` 社区动态 | PUBLIC | 作者/时间、正文/标签、紧凑互动行的公开动态流与辅助栏；展开评论含引用回复。动态弹窗提交审核；评论/回复弹窗直接发布并可撤回，本人记录在独立子路由。 | `GET /posts`<br>`GET /me/posts`<br>`POST /posts`<br>`GET /posts/{id}/comments`<br>`PUT /posts/{id}/like`<br>`POST /reports` |
| `/buddy` 同路人组队 | USER | 我的/发现房间＋邀请栏；成员/共享任务详情弹窗，添加任务再独立弹窗；本人进度、房主邀请/管理、关闭/退出确认；10秒轮询保留滚动/草稿，失败隐藏私有数据。 | `GET /buddy/candidates`<br>`GET /buddy/rooms`<br>`POST /buddy/rooms`<br>`POST /buddy/rooms/{id}/join`<br>`GET /buddy/invitations`<br>`GET /buddy/rooms/{id}/tasks` |
| `/radar` 公司情报雷达 | PUBLIC | 公司/7或30天筛选、紧凑情报列表与真实分页；正文/来源/核验日期在详情弹窗展开，举报另弹窗；不称实时HC库存。 | `GET /radar/signals` |
| `/me` 个人中心 | USER | 头像/资料、实际统计、近期活动、收藏/简历/设置入口；显示由真实事件派生的成就。 | `GET /me`<br>`GET /me/overview` |
| `/favorites` 我的收藏 | USER | 岗位/公司/面经/题目分类、预览与取消、批量取消逐项反馈，目标失效有占位。 | `GET /favorites`<br>`DELETE /favorites/{type}/{id}` |
| `/notifications` 通知中心 | USER | 未读筛选、已读/未读、删除、全部已读；跳转目标先校验站内路径。 | `GET /notifications`<br>`PATCH /notifications/{id}`<br>`POST /notifications/read-all` |
| `/settings` 设置 | USER | 五类导航：个人资料/求职偏好/外观与时区/账号安全/数据管理；双列表单、44px控件与填写提示。备份/文件/恢复按需弹窗，高风险操作验证密码并输入确认词；管理角色仅前三个通用分类（资料/外观/安全），不读取私人文件。 | `PATCH /me`<br>`PUT /auth/password`<br>`POST /account/exports`<br>`POST /account/import-previews`<br>`POST /account/reset`<br>`DELETE /me` |
| `/admin` 内容管理 | REVIEWER | 审核队列、公共资料管理与举报；跨模块显示待审总量，10秒/前台/手动同步，八类筛选（评论直接发布，ADMIN另有评论管理/删除）；审核弹窗保留输入。ADMIN可录入与编辑，普通用户API拒绝。 | `GET /admin/moderation`<br>`POST /admin/moderation/{type}/{id}/decisions`<br>`GET /admin/jobs`<br>`GET /admin/reports` |
| `/admin/services` 服务管理 | ADMIN | 依赖状态、积压、失败任务、显式重试、审计记录；不显示凭据或私有任务载荷。 | `GET /admin/services`<br>`GET /admin/tasks`<br>`POST /admin/tasks/{id}/retry`<br>`GET /admin/audit-logs` |

## 本人投稿子路由

| 路由 | 权限 | 展示与操作 |
| --- | --- | --- |
| `/submissions` | USER | 六类本人投稿汇总，类型/审核状态筛选、分页、刷新；社区入口跳此路由并筛选POST，评论与回复有独立子路由。 |
| `/submissions/community`（兼容`/community/submissions`） | USER | 本人动态管理；新增/编辑弹窗、确认删除，编辑重新待审；位于我的投稿导航下。 |
| `/submissions/comments` | USER | 本人评论/回复全文、发布/隐藏状态、撤回、原评论引用和关联帖子入口；不再显示评论待审流程，原帖不可看时占位。 |
| `/experiences/submissions` | USER | 本人面经草稿/待审等；编辑弹窗、显式提交审核；与`/experiences/:id`详情路由区分。 |
| `/salary/submissions` | USER | 本人薪资样本和审核状态；新投稿弹窗，不提供不存在的编辑接口。 |
| `/referral/submissions` | USER | 本人内推资源审核状态，返回公开机会页继续查看/提交。 |

## 共用页面合同

- 桌面侧栏、72px顶栏、全局搜索、通知、主题、用户菜单；移动布局见[设计规范](03-design.md)。
- 业务模块按路由懒加载；状态不是另一个路由，但必须可测试。认证页独立布局，引导独立布局，公共内容可匿名浏览。
- jobs的q/city/role/companyId/education/recruitmentType/graduationYear/status/sort/view/page写URL；改变筛选重置page。
- Drawer的preview只控制预览；题库question、宝典chapter、面试round参数分别定位资源。
- 后退/刷新/深链接仍显示同一资源；资源不存在或私有越权统一404；表单失败保留草稿。
- CSV、Markdown、阅读导出在浏览器从当前已授权的数据生成，不为纯格式转换新增后台任务。
- 成就不新增独立表，由本人事件按固定规则派生code/name/earnedAt/rule，经/me/overview返回；页面保留成就位置、图标和说明。
- 旧站外部OAuth callback不是产品页面，本设计不保留/auth/callback；不删除39个业务页面中的任何一个。
