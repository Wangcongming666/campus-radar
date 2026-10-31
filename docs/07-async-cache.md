# 异步任务、通知与会话

本文描述当前实现；实际验证见 [HANDOFF](HANDOFF.md)。业务数据以MySQL为准，Redis保存会话/限流，RabbitMQ传递可重复的任务执行信号。普通CRUD同步返回，长期工作返回202与任务回执。

## 任务和Outbox

`TaskService.enqueue`在当前业务事务中同时写tasks与TASK_DISPATCH Outbox。每秒领取一条到期事件，以MySQL `FOR UPDATE SKIP LOCKED`及60秒租约避免多个发布者同时领取；事务外发布，收到Rabbit confirm且无return才标PUBLISHED。失败持续退避，发布次数不消耗业务attempt，也不因固定发布次数静默丢任务。

本机每个数据库使用独立durable队列 `campus.tasks.<数据库名>` 与direct exchange `campus.events.<数据库名>`，路由键task.execute。后台2个消费者；生产可通过TASK_QUEUE/TASK_EXCHANGE配置。

消费者先锁任务，通过Inbox记录eventId并领取5分钟租约。终态/重复完成事件不再执行；旧租约不能提交结果。当前处理器实现SUBSCRIPTION_SCAN、DATA_EXPORT、DATA_IMPORT、USER_ERASURE；文件物理清理由定时器完成，邮件使用下述独立投递器。

业务执行最多5次，临时失败进入RETRY_WAIT并持久安排下一事件，退避10/20/40/80秒，后续受一小时上限约束。成功记录SUCCEEDED及resultFileId。租约回收器每15秒检查过期RUNNING和已失去有效投递的排队任务；失败导入解除冻结并使预览失效，管理员重试仍会重新检查签名、账号状态与原修订，不允许绕过归属和版本。

管理端 `/admin/services` 展示依赖状态、Outbox数量与最老年龄，`/admin/tasks`查看任务并授权重试。外部生产环境应为Rabbit配置死信策略、积压与失败告警；当前本机验收没有把外部监控/告警接入算作已完成。

## 邮件

AUTH_MAIL与SUBSCRIPTION_MAIL分别从MySQL Outbox领取并直接调用SMTP；邮件正文AES-GCM加密持久化，Outbox只保存投递ID。链接令牌只以哈希进入auth_tokens，原令牌不写普通日志。发送成功清除加密正文；失败持久退避，达到上限记FAILED。SMTP确认后进程中断可能导致重发，业务令牌和通知命中仍幂等。

本机SMTP是Mailpit，界面38025；它证明本机投递链路，不证明外部收件箱送达。邮件加密密钥必须独立保管，不能因部署重启随机替换。

## 定时工作

- 订阅与日程/规划提醒通过受控定时器运行：默认每分钟轮询，启用订阅按15分钟周期排队扫描。每类批次100、最多5批，限定单轮预算。
- 扫描任务以订阅与时间窗口去重，跳过已有排队/执行中任务；worker读取最新启用状态。命中唯一键为subscriptionId+jobId+jobVersion，同版本重扫不重复通知或邮件。
- 日程/规划仅在有效到期窗口、资源仍未取消/完成且账号ACTIVE/IDLE时生成站内提醒。提醒receipt与通知在同一事务，通知删除后不因下次轮询重新发送；修改资源版本后按新版本检查。
- 私有文件删除、过期备份和暂存孤儿清理有界执行；活跃导出/恢复任务及文件引用不会被清理器抢先删除。
- 账号导出快照以dataRevision检查一致性；恢复/重置期间暂停普通写入。注销立即提高authVersion，异步清理后删除账号并匿名保留已发布公共内容。

## Redis

Spring Session保存30分钟空闲会话，应用另检查七天绝对期限；每次私有请求重读数据库账号状态/角色/authVersion，改密或注销能撤销所有旧会话。

CSRF绑定会话，写请求同时校验Origin。前端登录、登出、改密/邮件重置后更新本地CSRF状态，不把会话持久化在localStorage。

限流用Redis Lua原子计数和TTL；键采用会话环境命名空间及邮箱哈希，测试与业务环境不会共享计数。匿名读60次/分钟、用户写60次/分钟；邮件、失败登录及上传有独立窗口。拒绝返回429和Retry-After，Redis不可用时返回503。自动验收可临时设RATE_LIMIT_MULTIPLIER=10，正常运行默认1。

## 故障边界

MySQL不可用时不能确认业务保存，返回503；Rabbit不可用时已提交任务留在Outbox等待，202只表示排队；SMTP不可用保留投递状态并重试；私有文件卷不可用不伪造原件成功。前端显示错误且保留可恢复草稿，不回退演示数据。

数据库及私有文件需要一起备份；邮件/备份密钥独立备份。Redis会话丢失允许重新登录，Rabbit恢复后可从持久任务/Outbox恢复。生产RPO/RTO、容量、外部SMTP及跨主机灾备恢复仍需目标环境实测。
