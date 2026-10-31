# 开发与运行

服务器空库部署见[宝塔原生完整流程](11-deployment-bt-native.md)：在本机构建发布包，生产外部配置单独上传；普通Maven package默认排除dev/prod环境配置，但保留编译资源供本地IDEA使用。以下步骤仅适用于本机开发。

后端默认启用 `dev`，在 IDEA 中直接运行 `CampusRadarApplication`。后端配置只有 [application.yml](../backend/src/main/resources/application.yml) 和 [application-dev.yml](../backend/src/main/resources/application-dev.yml)：前者保存通用设置，后者保存本机连接、账号、密码及 `campus` 下的业务配置。修改本机配置直接编辑后者。

## IDEA 启动

1. 用 IDEA 打开项目，导入 `backend/pom.xml`；Project SDK、Maven 导入与运行 JDK 均选 **21**，Maven 选 **Use Maven wrapper**。项目使用 Wrapper，无需另装全局 Maven。
2. 启动 Docker Desktop，在项目根目录执行 `docker compose -f infra/compose.yml up -d`。依赖的本机值直接写在 Compose 文件中。
3. 已有 `campus_radar` 数据库直接使用。只有首次创建全新空库时，用 MySQL `root` 账号手动执行一次 [完整建表 SQL](contracts/schema.sql)，然后使用业务账号 `campus_app` 运行后端。不要对现有业务库重复执行建表 SQL。
4. 打开 `backend/src/main/java/com/campusradar/CampusRadarApplication.java`，直接运行 main。默认 `dev` 会加载本机配置，API 地址为 `http://127.0.0.1:8080/api/v1`。
5. 在项目根目录运行 `npm --prefix frontend ci`，然后运行 `npm --prefix frontend run dev -- --port 5179`，打开 `http://127.0.0.1:5179`。前端 `/api` 请求代理到后端 8080。

Java 启动不自动建表，通用配置中 SQL 初始化模式为 `never`。已有业务库和 Docker 数据卷继续保留。8080 已被旧 Java 进程占用时，先停止旧进程；使用脚本启动的应用可用 `./scripts/stop-local.sh` 停止。

本机 Maven 依赖缓存可复用 `/Users/wangcong/Desktop/校招雷达/.data/maven-repository`。若 IDEA 显示依赖或插件无法解析，在 Maven 设置的 Local repository 勾选 Override，填写该路径后 Reload Maven Projects；也可以使用默认仓库重新下载依赖。

## 依赖与数据库工具

| 服务 | 本机地址 |
| --- | --- |
| MySQL | `127.0.0.1:33077`，数据库 `campus_radar` |
| Redis | `127.0.0.1:36379` |
| RabbitMQ | `127.0.0.1:35672`，管理界面 `http://127.0.0.1:35673` |
| Mailpit | SMTP `127.0.0.1:31025`，收件界面 `http://127.0.0.1:38025` |

IDEA Database 工具窗口连接 MySQL 时填写上述主机、端口、数据库和用户 `campus_app`，密码查看 `application-dev.yml` 的数据源配置。数据库工具的数据源与 Java 运行配置独立；Java 已从 YAML 读取连接设置。

本机已按用户要求预置 `admin@campusradar.test`（ADMIN）与 `user@campusradar.test`（USER），均已验证邮箱；密码见 `.data/test-access.json`。管理员登录后进入 `/admin` 可维护、删除测试目录内容。新账号注册后即为正常状态，可直接登录，无需 Mailpit 验证；Mailpit 继续用于找回密码和邮件订阅。网站账号与 MySQL 账号相互独立。

## 可选脚本与检查

`./scripts/start-local.sh` 是一键启动选项，`--dev` 使用前端热更新；日常后端开发直接使用 IDEA 即可。停止应用用 `./scripts/stop-local.sh`；添加 `--services` 同时停止依赖容器，数据卷保留。

在项目根目录执行适合本次改动的检查：

```sh
./backend/mvnw -f backend/pom.xml test
npm --prefix frontend run generate:api
npm --prefix frontend run typecheck
npm --prefix frontend test
npm --prefix frontend run build
```

完整真实验收与实际执行结果见 [测试说明](09-testing-release.md) 和 [最新交接](HANDOFF.md)。启动应用无需先跑验收脚本。

## 修改约定

HTTP 字段先改 [OpenAPI](contracts/openapi.json)，再生成前端类型，同步 Java、页面与相关测试。响应显式投影，排除密码、存储键、令牌与内部证据。数据库结构以 `schema.sql` 为完整说明；结构调整需明确评估已有数据，不能靠重建业务库完成修改。

私人查询从认证主体取得 userId，归属、版本、幂等和事务由服务端控制。前端共享客户端处理 Cookie、CSRF 与错误，409 时保留草稿并提示核对。业务数据由服务端保存。

私有文件通过后端鉴权读写，存储目录不能挂为静态资源。备份恢复校验本人、同环境、签名、有效期与原件信息；本机密钥修改会影响既有邮件或备份，修改前先确认用途。

### 后端进程归属

日常只由 IDEA 启停 8080 后端。2026-10-29 本次已停止此前单独启动的 JAR，临时 8082/5181 联调服务也已关闭；没有为保持页面数据而留下独立后台服务。前端 Vite 的存活不代表 Java 服务存活。后端停止后页面在下次复核或聚焦请求失败时隐藏旧数据；当前首页每10秒复核。
