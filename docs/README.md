# 校招雷达 · 开发文档

更新于 2026-10-29。当前是 React + Java 的完整本机应用，39 个页面默认使用真实 API。继续工作先读 [最新交接](HANDOFF.md)，本机启动按 [开发指南](08-development.md) 操作。

唯一开发目录为 `/Users/wangcong/Desktop/校招雷达`，代码、文档和后端均保存在此目录。

| 要解决的问题 | 文档 |
| --- | --- |
| 产品范围与业务规则 | [产品说明](01-product.md) |
| 页面布局、交互和接口 | [页面与接口映射](02-pages.md) |
| 颜色、字号、间距、主题、响应式 | [前端设计规范](03-design.md) |
| 技术选型、模块职责、依赖 | [系统架构](04-architecture.md) |
| 表、字段、关系、索引、事务 | [数据库设计](05-database.md) · [完整建表 SQL](contracts/schema.sql) |
| 请求、返回、权限和错误 | [接口说明](06-api.md) · [OpenAPI 3.1](contracts/openapi.json) |
| 队列、重试、幂等与缓存 | [RabbitMQ 与 Redis](07-async-cache.md) |
| IDEA、本机配置与启动 | [开发指南](08-development.md) |
| 测试场景与检查入口 | [测试说明](09-testing-release.md) |
| 已确认的项目决定 | [当前状态](CONTEXT.md) |
| 首页内容、动效与素材来源 | [首页设计](13-homepage-design.md) |
| 实际检查结果 | [最新交接](HANDOFF.md) |

最新用户指令优先。业务规则以 01 为准，页面以 02–03 为准，数据库字段以 `schema.sql` 为准，HTTP 字段以 OpenAPI 为准。数据库使用 snake_case，对外 DTO 使用 camelCase；修改合同要同步对应实现和说明。

后端只使用 `application.yml` 和 `application-dev.yml`，默认启用 `dev`，IDEA 直接运行主类。已有数据库继续使用；完整 SQL 仅供全新空库首次手动初始化。本机实际验证与公开部署是不同范围，外部 SMTP、HTTPS 和生产容量需在目标环境另行验证。
