# 最新任务交接

更新：**2026-10-31 19:48，Asia/Shanghai**。唯一开发目录：`/Users/wangcong/Desktop/校招雷达`；只有用户明确要求时才创建工作树。

## 本轮目标与结果：上传 GitHub，使用 master

- 用户明确授权提交并推送到 `Wangcongming666/campus-radar`，分支指定为 **master**。沿用既有 Git 历史，没有重新初始化、强制推送或创建工作树。
- 项目代码提交 **`01bbcfa`**：Java21 后端、React 前端、合同/数据库/部署文档、脚本和旧 Next.js/PostgreSQL/worker 目录删除，共816个文件变更。原有重构与删除均属于本轮开始时的工作区内容。
- 19:47 实际 `git push -u origin master` 成功创建远程 master 并建立上游；GitHub 仓库元数据随后确认默认分支为 **master**。本交接文档随后单独提交、推送。
- origin 获取地址保留 `https://github.com/Wangcongming666/campus-radar.git`；HTTPS 缺少登录凭据，改用本机已有 `id_ed25519_github` 密钥成功推送。仅本项目配置了 SSH push URL `git@github.com:Wangcongming666/campus-radar.git` 和 `core.sshCommand`，后续可直接 `git push`，未更改全局 Git 配置。
- 仅额外清理 `docs/13-homepage-design.md`、`frontend/src/features/extended.css`、`frontend/src/features/personal-api.tsx` 的末尾空白行；没有新增产品功能、安装依赖或操作服务器。
- 依据：[GitHub 官方上传本地代码流程](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)。

## 本轮验证与限制（2026-10-31 19:45–19:48）

证据：`.data/verification/github-push/`，该目录不会上传。

- `backend-tests.log`：离线 Maven test 成功，149项，147通过、0失败/错误、2项显式 MySQL 集成默认跳过，完成于19:45:45。
- `frontend-tests.log`：11文件27项通过；`frontend-build.log`：TypeScript/Vite 构建通过。
- `tools-tests.log`：8项工具测试通过。
- `content-audit.json`：268个当前候选文件与10个已知本机/生产敏感值匹配检查无命中；常见私钥/GitHub令牌模式无命中，无超大文件。dev/prod配置、`.data`、target、node_modules、dist 的 Git 忽略检查通过。
- `history-audit.json`：待上传既有历史827个blob的同类检查无命中、无大于50MiB的文件。这是所列检查结果，不代表穷尽所有秘密类型。
- 首次暂存区 `git diff --cached --check` 发现3处文件末尾空白，清理后复查通过并提交。
- 网络受限环境内首次代理连接失败，直连尝试分别出现DNS失败/空响应；经授权执行本机代理后HTTPS只读连接成功，但HTTPS推送因未配置登录凭据失败。现有SSH密钥访问及实际推送成功；没有索取或打印密码、私钥或令牌。
- 本轮未重新执行浏览器专项、生产数据库连通、服务器部署或线上验收。下方历史部署验证不能当本轮新验证。

## 并行工作产生的未提交文件

19:47 推送期间发现下列5个文件出现新的工作区修改，未纳入 `01bbcfa`，本轮交接提交也只暂存本交接文件，不覆盖或提交这些改动：

- `backend/src/main/resources/application.yml`
- `deploy/baota/java-command.txt`
- `scripts/local.py`
- `scripts/package-release.py`
- `scripts/tests/test_release_tools.py`

这些修改需由正在处理它们的任务继续验证与提交。本轮测试对应上传的代码快照，不为后续并行改动提供通过结论。继续操作前先检查 `git status`，不要盲目 `git add -A`。

## 当前部署交付与待办

以下描述的是 `01bbcfa` 已交付的宝塔原生方案；并行修改可能正在调整配置加载方式，以后续任务验证后的交接为准。

- 正式环境采用宝塔 Java 项目运行后端、纯静态站点运行前端，MySQL/Redis/RabbitMQ使用服务器原生服务。Java21、运行用户www、API `127.0.0.1:8080`。
- 后端 `/www/server/campus-radar/backend/app.jar`；生产配置 `/www/server/campus-radar/config/application-prod.yml`；私有文件 `/www/server/campus-radar/private-files`；前端 `/www/wwwroot/campus-radar`。
- 当前用户在宝塔创建前后端项目。前端通过PHP建站入口也可选择“纯静态”，绑定 `39.107.60.14:80`；不需要安装PHP。使用包内 `baota/nginx.conf` 实现同源 `/api` 反代和SPA刷新，Java8080不对公网放行。实际是否成功建站/启动仍未确认。
- 宝塔此前提示 `profiles->[prod]` 找不到配置；已交付JAR故意排除私有dev/prod配置。需要在服务器以www身份确认外部配置可读，并使用绝对路径additional-location；不能仅凭面板提示证明启动成功或失败。
- 私有 `backend/config/application-prod.yml` 已按用户截图配置MySQL和RabbitMQ账号；Redis用户确认无密码，配置没有password字段；SMTP禁用。备份签名密钥已生成，不要重复生成。文件0600、Git忽略，单独上传服务器后设置root:www 0640，不放网站根、不打印密码。
- 用户自行上传和执行服务器步骤；本轮没有连接或操作目标服务器。服务器MySQL/Redis/RabbitMQ连通、RabbitMQ用户对 `/` 的权限、后端日志、公开统计API、注册登录/文件/异步任务、HTTPS和容量仍待真实验收。

最新既有交付文件位于本机隐藏目录 `.data/releases/`：

- `campus-radar-native-20261031T110024Z.tar.gz`，51,445,732字节。
- 同名 `.tar.gz.sha256`；SHA256 `a45caebdbbc129bbdf353296518e9b95208c97a5a064967dc7b6075c511bb4d4`。
- `campus-radar-native-20261031T110024Z-application-prod.yml`，独立私有配置，0600。

2026-10-31 19:23 已逐项核对归档中的JAR应用类/资源/依赖、前端dist、schema/部署文档及私有配置与当时本机结果一致，证据 `.data/verification/native-ready/latest-file-check.json`。这不证明19:47之后并行改动已进入旧归档。旧 `campus-radar-20261031T094714Z` 为历史混合部署包，不要使用或改名冒充native包。

原生包此前验证证据 `.data/verification/native-ready/`：后端147通过/2跳过、前端27项和构建、工具8项通过；JAR/tar无本机生产密钥、sidecar隔离和权限检查通过。此前Docker未运行，Nginx真实语法检查未执行成功，上传后需宝塔检查重载。

部署完整步骤以 [11-deployment-bt-native.md](11-deployment-bt-native.md) 为准：校验三文件→解压与目录权限→复制JAR/前端和独立配置→仅新空库导入schema一次→宝塔Java/静态站点→检查日志与API。后续更新跳过覆盖服务器生产配置的install行，保留已有密钥。

## 已完成业务规则与数据过渡

- 新注册账号直接ACTIVE并可登录，不要求邮箱验证、不发送注册验证邮件；邮箱仍用于登录/密码重置。冻结/停用/注销中账号继续拒绝登录。旧验证入口已移除，旧网页链接回登录。
- 2026-10-31 已授权并完成历史PENDING普通用户启用：1条账号/1条审计，幂等复核0/0；旧验证token已处理。**不要重复当待执行迁移**。真实新服务注册/登录回滚验证已通过，但此前要求用户在IDEA重启加载代码；本轮未检查当前IDEA进程。
- 评论直接公开；USER只可撤回本人评论，ADMIN按原因撤回并审计，REVIEWER不能删除。此前遗留PENDING评论过渡已完成，不重复执行。非公开投稿和他人私有内容继续隔离。
- USER/ADMIN/REVIEWER角色不继承。管理角色不访问求职私有业务；中央API边界未知操作默认拒绝，当前账号每次复核角色/状态/会话代次。账号切换需取消旧请求、清理缓存和隔离草稿。
- 既有MySQL共49业务表及历史flyway表，应用启动不会自动建表或迁移。已有真实用户/合成目录数据，不清库、不重复造数。MySQL投稿聚合collation修复已完成，无需重新迁移表。
- 过往逐页面UI与浏览器专项证据保留于 `.data/verification/`；业务/API/设计现状见01–09号文档，本交接不再累积多份过时任务记录。

## 运行入口与下一步

- IDEA打开 `backend/pom.xml`，JDK21，运行 `CampusRadarApplication`（8080）；日常由用户启停，避免另起替代JAR。
- 前端：`npm --prefix frontend run dev -- --port 5179 --strictPort`，访问 `http://127.0.0.1:5179`；本机密码重置邮件Mailpit38025。
- 本地dev私有配置、`infra/compose.yml`、`.data/test-access.json`均不上传；GitHub新克隆不自带本机凭据、依赖服务或测试数据，需要自行配置。
- 离线后端测试：在backend执行 `./mvnw -o -Dmaven.repo.local=../.data/maven-repository test`；前端 `npm --prefix frontend test` / `npm --prefix frontend run build`。
- 下一步先协调上述并行配置修改，再按原生手册继续用户自行部署，确认后端真实日志及前端API访问。后续 Git 推送继续使用master。

[运行说明](../README.md) · [开发](08-development.md) · [API合同](contracts/openapi.json) · [原生部署](11-deployment-bt-native.md)
