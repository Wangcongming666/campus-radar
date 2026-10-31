# 校招雷达

个人使用的求职网站：React前端、Java21后端、MySQL数据库。本机开发配置只维护两份文件：

- [application.yml](backend/src/main/resources/application.yml)：通用设置，默认使用dev。
- [application-dev.yml](backend/src/main/resources/application-dev.yml)：本机数据库、Redis、RabbitMQ、邮件地址与密码。

## 直接运行

1. Docker Desktop保持运行，启动已有依赖：

   ```sh
   docker compose --project-name campus-radar-dev -f infra/compose.yml up -d
   ```

2. IDEA打开`backend/pom.xml`，使用JDK21和Maven Wrapper，直接运行`CampusRadarApplication`。不需要环境变量、环境文件或额外运行参数。
3. 启动前端：

   ```sh
   npm --prefix frontend ci
   npm --prefix frontend run dev -- --port 5179
   ```

打开 http://127.0.0.1:5179 。后端端口8080；不要在8080同时启动两份后端。

本机已预置管理员 `admin@campusradar.test` 和普通用户 `user@campusradar.test`，均已验证邮箱。登录密码见本机私有文件 `.data/test-access.json`，管理入口 `/admin`。新账号注册后可直接登录，无需验证邮箱；本机找回密码邮件在 http://127.0.0.1:38025 。测试目录内容可在后台删除，重启不会自动补回。

## 数据库

现有`campus_radar`数据库可直接使用，应用启动不会自动建表、改表或清空数据。只有新建空库时，才需要手动执行一次 [完整建表SQL](docs/contracts/schema.sql)。

IDEA连接MySQL：`127.0.0.1:33077`，数据库`campus_radar`，用户和密码看`application-dev.yml`的`spring.datasource`。Docker服务定义在`infra/compose.yml`，数据保存在原命名卷中。首次空库导入SQL需要具备建表权限的账号；已有库无需导入。

## 可选工具

服务器原生部署（宝塔Java项目＋HTML项目、空MySQL、先IP访问）：见[从打包到上线](docs/11-deployment-bt-native.md)。普通Maven `package`自动排除私有环境配置，产物仍在backend/target；执行`python3 scripts/package-release.py --offline`可生成完整原生上传包，生产配置独立导出，正式环境不使用Docker/systemd脚本。

- `./scripts/start-local.sh`：自动构建并启动前后端；`--no-build`复用产物，`--dev`开启前端热更新。
- `./scripts/stop-local.sh`：停止脚本启动的前后端；`--services`同时停止Docker依赖，不删数据卷。
- `./scripts/verify-live.sh`：开发时执行真实浏览器验收，使用独立测试库，结束恢复正常业务库。

后端、前端依赖缓存和编译产物无需日常维护。密码只在本机配置文件管理，不需要再生成或导入其他环境文件。

[开发说明](docs/08-development.md) · [数据库说明](docs/05-database.md) · [接口合同](docs/contracts/openapi.json) · [最新交接](docs/HANDOFF.md)
