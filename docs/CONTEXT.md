# 当前项目状态

更新于 2026-10-29，Asia/Shanghai。继续工作先读 [最新交接](HANDOFF.md)，实际验证时间和待办以交接为准。

唯一开发目录为 `/Users/wangcong/Desktop/校招雷达`；只有用户明确要求时才创建或使用其他工作树。

项目采用 React 19、Java 21 / Spring Boot 4 / MyBatis-Plus、MySQL 8.4、Redis、RabbitMQ。39 个页面默认使用真实 API，账号、投递、知识、简历、面试/规划/Offer、练习、社区协作、订阅、审核和账号备份恢复已实现。

后端配置仅保留 `application.yml` 和 `application-dev.yml`，默认 `dev`。本机依赖启动后，IDEA 直接运行 `CampusRadarApplication`；步骤见 [开发指南](08-development.md)。现有业务库继续使用，Java 启动不自动建表；[完整 SQL](contracts/schema.sql) 供新空库首次手动建立 49 张业务表。

业务记录由服务端持久化，API 失败显示错误。样例业务仅用于显式演示入口，后台从正常网站账号通过本机脚本授权，没有默认网站账号。私有文件位于 `.data/private-files`，新注册无需邮箱验证；找回密码等本机邮件由 Mailpit 接收。

原 Git 基点属于旧架构，已授权删除的旧文件与当前未提交重构成果须保留。缺少旧站完整截图，不声称逐像素复刻；本机联调不等同公开 HTTPS、外部邮件送达或生产容量与灾备验收。
