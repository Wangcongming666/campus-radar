# Java后端

IDEA打开本目录的pom.xml，选择JDK21和Maven Wrapper，直接运行`CampusRadarApplication`。默认读取application.yml与application-dev.yml，不需要配置环境变量。

本机连接地址和密码统一在`src/main/resources/application-dev.yml`修改。MySQL、Redis、RabbitMQ和Mailpit由项目根目录infra/compose.yml提供，先保持这些服务运行。

现有数据库直接连接；新空库手动执行一次`../docs/contracts/schema.sql`。启动不会自动创建或更新表。

在项目根目录执行检查：

```sh
./backend/mvnw -f backend/pom.xml test
```

Maven仓库可在IDEA设置为`/Users/wangcong/Desktop/校招雷达/.data/maven-repository`以复用已下载依赖。

完整启动步骤见[根README](../README.md)，最近实际验证见[HANDOFF](../docs/HANDOFF.md)。
