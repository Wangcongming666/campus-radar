# 最新任务交接

更新：**2026-10-31 19:41，Asia/Shanghai**。唯一目录：`/Users/wangcong/Desktop/校招雷达`。**用户最新已明确授权直接修改部署相关代码、全部配好并给从打包到上线步骤**，覆盖此前只要指令的限制。用户补充确认Redis无密码、MySQL沿用截图密码，并提供RabbitMQ已开启和现有账号信息。此轮代码/生产配置/原生部署包已完成并验证；没有连接或操作目标服务器，用户自行上传和在宝塔执行。

## 当前前端建站入口说明（19:41）

用户询问前端为何显示添加PHP。已核对宝塔官方创建站点文档：PHP建站窗口也支持PHP版本选择“纯静态”；因此当前前端可经该入口建站，无需安装PHP。填写IP39.107.60.14、80端口、根目录/www/wwwroot/campus-radar，FTP/数据库均不创建；index.html应直接在根目录。创建后将已交付包baota/nginx.conf用于这个前端站点的配置，检查保存重载，实现/api反代与SPA刷新。Java仍独立8080，不再绑定同一个IP:80。

本轮仅查阅官方资料和更新交接；没有修改代码、生产配置或已交付归档，没有操作服务器、运行构建或验证上线。用户尚未提供当前添加PHP弹窗截图或后端成功日志，实际建站与服务状态仍待用户确认。官方依据：https://docs.bt.cn/user-guide/site/php/create-web/ 。

## 当前宝塔prod预检查提示（19:37）

用户创建项目时弹出“profiles->[prod]，实际未找到相关配置文件”。本轮只读确认本机JAR故意不包含application-prod.yml，生产配置在外部文件；已核对Spring Boot4.0官方additional-location支持，不能仅凭此提示证明外部文件不可加载，也不能未经服务器检查就保证提示无害。

当前建议用户在宝塔终端以www身份验证/www/server/campus-radar/config/application-prod.yml可读；可读且启动命令保留--spring.profiles.active=prod及绝对additional-location时，可继续创建并看实际启动日志。若缺文件/不可读，先复制独立sidecar并修复root:www 0640、父目录0750；不要重新把生产密码打进JAR。未连接服务器、无代码/包变更或构建；后端是否成功启动尚未确认。

## 当前宝塔Java表单（19:34）

用户已进入添加Java项目页面，截图SpringBoot/JDK21.0.2、运行用户www、端口8080；默认启动命令仍是1GB堆且缺少prod外部配置参数。应将命令替换为deploy/baota/java-command.txt同样选项，并把java可执行文件改成截图实际/www/server/java/jdk-21.0.2/bin/java；JVM参数在-jar前，JAR后带--spring.profiles.active=prod和绝对路径additional-location。

表单其余：项目路径完整/www/server/campus-radar/backend/app.jar，端口8080不勾公网放行，环境变量选无，绑定域名/前端资源留空，后端路由默认/，开启守护。前端仍独立HTML项目绑定IP:80。提交后用户看日志并curl本机public/stats，不能把表单填写当启动成功。本轮19:34只读核对已交付命令与目录脚本、更新交接；没有修改任何包、代码或服务器。此前上传校验/复制是否成功尚未收到输出，不冒称已解决。

## 此前上传文件名问题（19:28）

用户上传截图显示/root/uploads里前两个文件是旧campus-radar-20261031T094714Z.tar.gz及对应sha256，第三项开头是新版native配置（完整名截图被截断）。执行的新命令查找campus-radar-native-20261031T110024Z.tar.gz.sha256，因此第一步No such file or directory。set -e已在首个校验停止，本次后续解压/复制尚未执行。

应补传正确native程序包和对应sha256到/root/uploads，确认配置文件全名为campus-radar-native-20261031T110024Z-application-prod.yml，再重跑原部署命令。不能把旧包直接改名，两版内容不同。19:28本机只读确认新版三文件存在且归档SHA匹配；未修改任何包或服务器，本轮无构建/代码变更，仅更新交接。

## 最新文件确认（19:23）

用户询问3个上传文件是否最新。本轮直接读取tar内部内容，与当前backend/target JAR的全部应用类/资源/依赖逐项哈希比较、frontend/dist全部文件比较，以及schema/宝塔配置/部署文档比较，全部一致；私有sidecar与当前生产配置逐字节一致，归档SHA256匹配。当前JAR重打时间19:19:32，包最后生成19:03:29，但程序内容未变化；包名时间戳为UTC，110024Z对应北京时间19:00:24。可继续使用既有3个文件。证据.data/verification/native-ready/latest-file-check.json，无代码修改、重新打包或服务器操作，不输出任何秘密。

## 当前用户操作进度（19:22）

用户已分别打包前后端，并在服务器创建/root/uploads，询问此前3个上传文件在哪里。本轮只读确认：backend/target JAR、frontend/dist/index.html、源生产配置以及.data/releases中的原生tar.gz、sha256、私有sidecar全部存在。应向用户说明：分别打包产生JAR/dist；前次已经整理好的3个上传文件在本机/Users/wangcong/Desktop/校招雷达/.data/releases（隐藏目录，可访达⌘⇧G进入），上传这些既有3文件可继续原解压流程。本轮没有重打包、上传或操作服务器，没有新测试，仅核实文件存在并更新交接。

## 本轮最终部署状态（以此为准）

- 正式环境仍完全采用宝塔原生：Java项目管理后端、HTML项目管理静态前端，MySQL/Redis/RabbitMQ为服务器已有原生服务。应用运行用户www，Java21，API127.0.0.1:8080，外部生产配置/www/server/campus-radar/config/application-prod.yml；网站根/www/wwwroot/campus-radar；私有文件独立/www/server/campus-radar/private-files。
- **普通Maven clean/package已自动排除dev/prod私密配置**：pom新增maven-jar-plugin excludes，不需要用户再传campus.local-config-exclude或勾release，产物仍在backend/target。target/classes中dev资源保留供IDEA本地运行，默认开发配置不变。release旧别名保留但当前不使用。
- 私有backend/config/application-prod.yml已补齐用户信息：MySQL127.0.0.1:3306/campus_radar及截图凭据；Redis127.0.0.1:6379/DB0且明确**无password字段**；RabbitMQ127.0.0.1:5672，用户截图现有admin及密码，虚拟主机按默认`/`。不在交接/通用文档/公开包复述密码。5672是AMQP，15672是管理网页，不能混用。服务器实际端口及/授权尚需用户启动前核对，不冒称已连通。
- 生产配置0600/Git忽略、备份签名密钥保持不变、IP HTTP Origin仍http://39.107.60.14，SMTP仍禁用。没有任何CHANGE_ME占位项，客户端读取Redis时不会发送密码。服务器将来加Redis密码需同步配置再重启Java。
- scripts/package-release.py已从旧混合模式改成**只生成原生上传包**：标准target JAR、frontend/dist、空库schema、docs11、deploy/baota的nginx.conf/java-command.txt/prepare-directories.sh。私有配置独立导出600 sidecar，**不进tar、不进JAR、不进frontend或stage**；不夹带Compose或systemd服务文件。碰撞版本（包括私有sidecar/断链）会拒绝覆盖。
- deploy/baota/prepare-directories.sh只由用户在服务器root执行目录/权限准备，不安装或启停服务。现成Nginx配置支持同源/api、SPA刷新、101m、缓存和ACME。README、08-development、11-deployment-bt-native已统一这套流程；后续更新明确跳过覆盖生产配置的install行，保留服务器当前密钥。

## 最终交付文件

- 原生程序包：`.data/releases/campus-radar-native-20261031T110024Z.tar.gz`，51,445,732字节，约51MB。
- 校验文件：同名`.tar.gz.sha256`；SHA256 **a45caebdbbc129bbdf353296518e9b95208c97a5a064967dc7b6075c511bb4d4**。
- 独立私有配置：`.data/releases/campus-radar-native-20261031T110024Z-application-prod.yml`，0600。仅用户本人上传到后端config目录，勿放网站根。对应源码为backend/config/application-prod.yml。
- 解压目录同名。最终仅补充“更新跳过覆盖配置”文档后重新生成归档/校验，二进制保持构建结果不变，package-final.log已记录此文档刷新，artifact-audit.json记录最终SHA。
- 上一轮campus-radar-20261031T094714Z属于旧Docker/systemd历史包，**不要继续推荐或使用**；本轮原生包有native前缀。

## 本轮验证（2026-10-31约18:53–19:04，Asia/Shanghai）

证据`.data/verification/native-ready/`：

- default-package-before.log：普通构建成功，但JAR仍包含dev配置的安全断言失败，复现缺陷。修复后backend-final.log/package-final.log中普通Maven构建均成功，**149项：147通过、0失败/错误、2项原有显式MySQL默认跳过**。
- frontend-tests.log及package-final.log：前端11文件27项通过；frontend-build.log及最终包中TypeScript/Vite构建通过。没有修改产品UI，不重复浏览器视觉矩阵。
- tools-final.log：**8项工具测试通过**，含原生白名单无旧运行器/无私钥、未完成凭据拒绝、私有sidecar已存在时不删除、新文件600。private-export-red.log先因缺少修正方法失败；独立审查已用fixture复现原except误删碰撞文件，现O_EXCL在try外且只清理本次创建文件，复查通过。
- config-check.log：安全YAML解析、MySQL和原生端口、Redis未设置密码字段、Rabbit现有账号/默认vhost、备份密钥32字节及0600通过，不输出秘密。prepare脚本/文档Bash语法、Python编译、Git忽略与git diff --check通过。
- artifact-audit.json：普通Boot JAR不含dev/prod，base配置/API合同在，target/classes开发资源仍在；JAR与公共归档无本机或生产密钥字面量；包内及整体SHA通过，无链接/越界成员，无Docker/systemd；独立配置与源码一致且0600。
- requesting-code-review只读复查完成：sidecar碰撞清理问题已修，无新增重要问题，文档后续更新保护说明也已补。
- **未执行/失败如实记录**：本机Docker引擎未运行，尝试Nginx-t的临时容器无法连接daemon（nginx-check.log），没有代用户启动Docker；因此本轮不声称Nginx实际语法检查通过，上传后由宝塔检查并重载。未启动任何替代JAR或操作云服务器，未验证目标MySQL/Redis/Rabbit连通、Web注册/文件/异步任务、SMTP、HTTPS或容量。用户截图只证明面板显示服务开启。

## 从打包到上线（用户执行）

1. 以后IDEA普通Maven clean/package或backend ./mvnw clean package即可；前端npm run build。完整包可根目录python3 scripts/package-release.py --offline。
2. 将上述tar.gz、sha256和私有配置3文件上传/root/uploads，按docs11校验解压，prepare目录，复制JAR/前端，install私有配置root:www 0640。
3. 仅向新空campus_radar导入schema.sql一次，已导入不要重导；确认MySQL/Redis运行、Rabbit现有用户对/有配置/读/写权限。
4. 宝塔Java项目选JDK21、www、8080、关闭外网映射，使用包内baota/java-command.txt；若JDK路径不同，仅替换实际java路径。
5. HTML项目绑定IP39.107.60.14:80，根/www/wwwroot/campus-radar，复制baota/nginx.conf到该站点配置并检查重载。
6. 云安全组/面板放行80，curl本机公开统计200后浏览器HTTP访问，自己注册直接登录并验证记录/附件/异步任务；没有默认正式网站账号。完整细节及首个管理员事务见docs11。

## 此前Redis进度（历史，已由上方配置完成状态更新）

## 此前Redis安装记录

- Redis已由用户截图确认面板状态正常；具体版本、监听端口和认证密码未从截图得知，不能冒称后端已连通Redis。
- 2026-10-31 18:48只读确认backend/config/application-prod.yml仍存在，Redis与RabbitMQ密码均保持CHANGE_ME占位项，没有改配置或猜密码。
- 下一步由用户在Redis设置确认127.0.0.1:6379并设置密码，将实际密码替换生产配置对应项；RabbitMQ仍待安装与配置。全部依赖就绪后再按原生方案由宝塔Java项目启动后端。
- 没有新增代码，本轮未跑构建/单测或服务器连通验证。继续遵守用户只需指令、自己执行、完全不用Docker的部署选择。

## 当前直接打包与上传方式

- 截图及本轮只读确认backend/target/campus-radar-0.1.0-SNAPSHOT.jar存在且是可执行Boot JAR，但普通打包仍包含application-dev.yml；backend/config/application-prod.yml不在JAR内。
- 为保持用户偏好的backend/target输出目录，给出`./mvnw clean package '-Dcampus.local-config-exclude=application-dev.y*'`（在backend目录），利用现有pom属性排除本机开发配置，**不启用会改输出目录的release profile**。用户自行执行；本轮未重建或声称新JAR已排除开发配置。
- 前端在frontend目录执行npm run build，上传dist中的文件；JAR上传服务器后重命名app.jar；生产配置单独上传。SQL只导入专属新空库，不把源码/配置目录作为前端webroot。
- 原生指南第1步同步为target直接打包；原release profile仍可用但不作为当前首选指令。2026-10-31 18:24–18:25仅只读核对当前JAR条目、pom属性、配置存在和前端build脚本，文档Bash语法/diff检查通过；没有运行新的构建或服务器检查。

## 本轮数据库生产配置同步

- 宝塔表单填写：数据库campus_radar、用户campus_radar、字符集utf8mb4、本地访问、添加到127.0.0.1。数据库密码按本轮截图写入，**不在交接/回复/通用文档中复述**。
- 文件`backend/config/application-prod.yml`已新增：MySQL127.0.0.1:3306/campus_radar、相应用户名/截图密码；原生Redis6379、RabbitMQ5672/vhost campus_radar；IP HTTP及宝塔文件路径与11号部署指令一致。备份签名密钥已生成并保存，以后勿每次发版重生成。SMTP保持禁用。
- 文件权限0600，`.gitignore`已明确忽略；位于Maven resources之外，不打入JAR。本机application-dev.yml未改。需要用户把该文件**单独上传**到服务器/www/server/campus-radar/config/application-prod.yml，并设置root:www 0640与目录0750。
- **未完成信息**：Redis/RabbitMQ密码未提供，配置为CHANGE_ME_REDIS_PASSWORD、CHANGE_ME_RABBITMQ_PASSWORD；服务器安装设置后必须替换，不能把当前配置描述为已完整可运行。没有擅自猜测这些服务的密码或远程执行安装。
- 项目实际使用Redis：spring-boot-starter-session-data-redis存登录会话，AuthRateLimits通过StringRedisTemplate/Lua做请求与登录失败限流，因此服务器启动业务前要安装并启动Redis。RabbitMQ仍承担异步任务，也不能省略。
- 2026-10-31约18:20–18:22验证：Ruby安全YAML解析通过，核对DB/端口、待填密码、32字节备份密钥、HTTP Cookie配置、0600、Git忽略及Maven资源目录排除通过；git diff --check通过。未测试服务器连接，未执行打包或Java启动，未重跑无代码变动的全量单测。已更新docs/11-deployment-bt-native.md说明现有配置上传及待填项。

## 当前下一步

用户按上方参数创建宝塔数据库；Redis已安装，接下来确认监听地址/端口并设置密码，另按原生手册安装RabbitMQ。将这两个实际密码填入生产配置后，依原生手册自行打包/上传/导入schema和添加Java/HTML项目。不要使用旧Docker/systemd流程，也不要将生产配置误放到公开网站目录。

## 最新原生部署指令

- 前端→宝塔HTML项目/Nginx；后端→宝塔Java项目、JDK21、运行用户www、端口8080、显式prod及外部配置；MySQL8.4/Redis→宝塔原生软件商店；RabbitMQ→无原生插件时从宝塔终端安装官方Ubuntu22软件包，不用Docker应用。
- 当前本机指令通过campus.local-config-exclude属性排除开发密码，保持backend/target输出；用户自行构建JAR和Vite静态文件。不要推荐scripts/package-release.py作为原生打包命令，该脚本仍打包旧Compose/systemd ops。
- 新教程含原生RabbitMQ安装与vhost/用户、MySQL空库导入、原生端口3306/6379/5672、完整application-prod.yml模板、权限、Java表单每项值/完整启动命令、HTML站点/API代理、首个ADMIN授权审计、备份更新步骤。路径为/www/server/campus-radar（后端/配置/私有文件）、/www/wwwroot/campus-radar（仅前端）；与旧/opt混合方案分开。
- 2026-10-31约18:10–18:14仅核对源码/现有profile和官方宝塔/RabbitMQ文档，全部新文档Bash块语法检查通过；**没有执行其中打包、apt、数据库、Java或Nginx命令**，没有本轮构建/测试/上线结论。未对服务器环境做真实验收。
- 原生工具制作计划已被用户“只给指令”明确取代，勿继续自动实现该计划。此前只创建空deploy/native目录与.data下计划草稿，没有原生工具代码；空目录已清理，草稿标记不执行。

## 前次混合部署交付（历史，不再适用用户当前选择）

## 前次混合方案内容

- 完整流程：`docs/10-deployment-bt.md`，涵盖本机打包、服务器环境/可选swap、上传校验、随机配置、Docker依赖、空库建表、Java systemd、宝塔Nginx、云安全组/80、注册与管理员、SMTP、升级、备份/恢复/回滚、未来域名HTTPS。已在README和08-development链接。
- **最终唯一发布包**：`.data/releases/campus-radar-20261031T094714Z.tar.gz`（51,456,079字节，约51MB），校验文件同名加`.sha256`；SHA256为`d60bd7f5f319e1c34ee6a29cf1862b5ed72621e6e8964db7a94ef1fb974f0790`。时间戳为UTC。配套解压目录同名，包内`README-部署.md`与流程一致。两份本轮早期中间版本已删除，避免误发未经最终修正的包。
- `scripts/package-release.py`自动release构建/全量测试、前端单测/构建、JAR开发配置检查、白名单复制和SHA256打包。仅包含frontend静态文件、backend/app.jar、schema.sql、运维脚本/配置模板和文档，**不包含本机账号、数据、附件、开发密码、node_modules或运行密钥**。
- `backend/pom.xml`新增release profile：排除application-dev.y*，使用独立`.data/build/backend-release`，不清理IDEA的backend/target/classes。本机默认dev流程仍保留。测试资源显式提供不可投递的本地mail host/port，使release测试无需读取开发YAML。
- `deploy/`为生产模板：MySQL8.4/Redis8/RabbitMQ4.4专属Compose项目/命名卷，端口仅127.0.0.1:33078/36380/35674，有健康/日志/资源限制；Java21通过独立campus-radar系统用户和systemd运行8080；宝塔Nginx托管静态前端并同源代理/api，保留SPA刷新及ACME路径。
- `configure.py`在服务器新建独立密码、备份签名密钥，文件0600且拒绝覆盖；安装后应用配置root:campus-radar 0640。IP HTTP初始Secure=false，allowed-origins精确匹配http://39.107.60.14。update-origin保留密码/密钥并按HTTPS启用Secure。初始mail-key空，明确禁用邮件请求；注册直接登录不依赖SMTP，找回密码/邮件订阅需后续真实SMTP配置。
- `ops/bin`含安装、Compose包装、空库初始化（拒绝非空/断言49/收紧业务权限）、指定注册账号ADMIN授权并审计、停API一致性备份、只读smoke、严格空库+空文件目录恢复。文件在/opt/campus-radar/shared/private-files，配置在shared/config，均不在webroot或版本目录里。恢复拒绝连接失败/非空/归档链接/路径穿越，递归修复新服务器UID和700/600权限，完成后保持API停止供复核。
- 截图约2GB仅作为小规模试用预算，正式多人建议4GB以上；未完成服务器容量测试或实际端到端部署。HTTP没有传输加密，正式用户使用前应配置HTTPS；这是当前访问方式的限制，不强行阻塞用户的IP试用选择。

## 本轮部署验证（2026-10-31约17:31–17:49，Asia/Shanghai）

证据`.data/verification/deployment/`：

- `package-final.log`：最终release clean/package **149项：147通过、0失败/错误、2项旧显式MySQL默认跳过**；前端11文件27项通过，TypeScript/Vite构建通过。JAR打包完成。未重复无代码变动的浏览器页面矩阵。
- `tools-final.log`：5项配置/Origin/保留密钥/秘密JAR拒绝/恢复空库guard回归通过；Python编译、全部Shell脚本语法、Compose config --quiet通过。`doc-shell-check.log`：文档全部Bash块仅语法检查通过，没有在服务器执行命令。
- `old-jar-audit.log`先发现普通开发JAR含application-dev.yml；release修复后`release-audit.json`确认最终JAR无开发配置、本机密钥字面量不存在、包内校验和和压缩包SHA全通过、68个归档成员无链接或越界路径，无数据或运行密钥。
- **真实隔离MySQL8.4**：`mysql-check.log`使用新的临时容器、无网络和端口发布、内存/tmpfs限制，读取当前生产mysql.cnf，直接调用实际init-db.sh：首次成功49张表、用户0、新用户默认ACTIVE；第二次拒绝重导，业务DDL1142拒绝。测试容器及临时凭据均已删除，原数据库和服务未动。
- 初轮MySQL真实校验因官方镜像对数据库名下划线的授权转义报1141，保留`mysql-grants-before.log`；最终init和restore改为对专属campus_app撤销全部授权再用转义精确库名授予4类业务权限，经实际脚本重验通过。初期就绪检查也改为等待最终TCP实例，生产MySQL健康检查使用TCP避免误命中初始化socket。
- `nginx-check.log`：一次性nginx:alpine容器中的最终站点配置`nginx -t`通过，无端口发布，容器已删除；本机新增缓存该官方镜像，不安装项目依赖、不更改现有服务。
- requesting-code-review只读复查指出恢复空库检查依赖人工逐行执行、跨机UID未递归修复两项，已改独立恢复脚本并复查通过。代理正则初次误报已撤回，回归确认只匹配可信loopback。
- **未执行**：SSH/宝塔操作、Ubuntu apt安装、目标服务器Docker/数据库初始化、systemd验证/自启、外网HTTP注册/上传/任务、真实SMTP、HTTPS/容量和灾备全流程验收。不能把本机构建/临时容器检查写成已上线。

## 前次混合方案步骤（已被原生指令取代）

此前步骤为用户将最终tar.gz及sha256上传/root/uploads，按部署文档执行：校验解压→生成配置/安装service→Compose健康→空库init→启动Java→宝塔静态站和/api代理→安全组80→smoke→网站注册→服务器授权首个ADMIN。没有默认正式账号。不要把本机infra/compose.yml或application-dev.yml上传，不要把整个发布包放webroot，不要重复初始化非空库。后续更新先备份，保留shared和现有密钥。

## 前次认证入口去重（2026-10-31 17:14）

本轮之前只改前端，无需重启后端。此前取消邮箱验证的新后端是否已在IDEA重启加载仍未实际复核；本次发布JAR已包含该规则。

## 前次入口去重改动

- `AnimatedAuthPage.tsx`删除共享页头的重复账号切换Link，登录/注册两页同步；保留既有Tab切换、returnTo、草稿和提交锁。
- `login.css`删除对应strong样式及两处`:last-child`隐藏规则，避免删除右上角链接后，返回首页成为最后一项而在手机/窄桌面被误隐藏。未调整其他布局、动画或表单。
- 更新`docs/03-design.md`。无后端/数据库变更，无工作树、提交、推送、依赖安装或服务启停。
- 2026-10-31约17:13–17:14执行：TypeScript/Vite构建、Prettier和`git diff --check`通过。Chrome/WebKit×1440/1024/390×登录/注册**12组页面检查通过**：页头仅返回首页且各尺寸可见，切换栏两项与当前项正确，returnTo保留，无横向溢出；已人工查看桌面登录和手机注册截图，证据`.data/verification/auth-entry-dedup/`。本轮未重复后端或前端全量单测（仅移除重复UI）。
- Impeccable上下文引擎仍未安装且缓存目录不可写，未运行机械扫描或下载引擎；依据现有设计、源码与浏览器检查完成。

## 前次取消注册邮箱验证（2026-10-31 16:42）

上轮用户报告新注册用户登录失败，随后明确要求**取消邮箱验证，注册后直接登录**。源码、前端文案、合同、测试及历史账号过渡已完成；当时**仍需用户在IDEA重启后端加载新代码**。现有问题账号已在真实MySQL事务中从PENDING启用为ACTIVE，可用原密码登录。未创建工作树、提交、推送、部署、安装依赖或启停服务；保留原有修改和删除。

## 前次注册规则改动

- 最初只读核实：2026-10-31 16:30新账号为PENDING、未验证、有1个有效验证令牌，验证邮件SENT且仅送到本机Mailpit；已有ADMIN/USER通过5179代理登录、刷新CSRF和/me均200。用户确认报错“请先验证邮箱，或联系管理员处理账号状态。”并明确弃用邮箱验证。粘贴日志后端启动正常，Broken pipe不是本次已确认的账号状态根因。
- `AccountService.register`显式写ACTIVE，注册不要求邮件配置、不生成验证令牌或邮件；注册202仍统一受理，`verificationRequired=false`，重复邮箱不覆盖密码/昵称。邮箱仍作为登录与找回密码标识；新账号`emailVerified=false`，不伪造验证时间。冻结/停用/注销中账号仍拒绝登录，CSRF、密码哈希、角色边界不变。
- 移除verify-email/resend-verification后端入口、OpenAPI操作和重发限流；旧网页URL重定向/login并移除fragment。密码重置邮件、30分钟单次token、旧会话撤销继续保留，旧验证token不能再消费。AuthMail遇到遗留非重置模板停止投递。
- 注册成功显示可直接登录，取消登录/注册页验证和重发入口；设置和概览不再显示“邮箱待验证”；Canvas完成态文字和图标同步。邮件订阅移除不可再完成的验证条件，仅保留ACTIVE与邮件服务检查。真实验收helper改为注册直接登录，文件验收期望emailVerified=false。同步README、01/02/03/05/06/08/09与CONTEXT，生成前端API类型。数据库历史验证字段保留；新空库schema默认ACTIVE，现有表不改结构，服务显式写状态。
- **真实数据过渡已执行**：`docs/migrations/2026-10-31-registration-without-verification.sql`只启用历史PENDING USER，auth_version/version各+1并追加actor=NULL系统审计；结果**启用1条/审计1条**，随后幂等复核**0条/0条**。无关账号、管理账号和email_verified_at完全不变；旧普通账号VERIFY_EMAIL token标记消费。不得恢复已完成的验证要求或重复假称待执行。
- 真实MySQL新版服务验证：临时注册ACTIVE→登录USER，`emailVerified=false`、AuthMail=null仍可注册、mail/token增量0；事务全部回滚，真实用户总数不变。该检查调用新编译服务，不是8080旧进程已加载新规则的证据。

## 前次注册规则验证与证据

证据目录`.data/verification/new-user-login/`，执行时间2026-10-31约16:31–16:42，Asia/Shanghai。

- `database-state.log`、`known-accounts.json`：初始真实状态只读与两角色登录200；未输出邮箱、密码、token或用户正文。
- `backend-red.log`：新需求在旧注册逻辑下失败；`notification-red.log`：旧订阅验证条件阻止正常未验证用户；`frontend-red.log`：旧页仍显示邮件受理，直接登录成功提示断言失败。初次Maven从根目录用相对缓存路径失败，已改在backend执行；一次添加测试使用错误相对路径未生效，已纠正后实际运行。
- `backend-green.log`：**149项：147通过、0失败/错误、2项原有显式MySQL默认跳过**；覆盖立即登录/无邮件依赖、重复注册不覆盖、非ACTIVE拒绝、注册响应false、密码重置加密/单次消费/会话撤销、邮件订阅等。最终文案清理后的全量重跑`backend-final.log`于**16:40:30**再次通过同样149项（147通过/2跳过）。
- 前端`frontend-unit.log`：11文件**27项通过**；`frontend-build.log`：最终TypeScript/Vite构建通过；`format-check.log`：本轮格式检查通过。初次移除验证分支后遗留不可达/login类型比较导致TS2367，已清理并构建通过。
- `browser-green.log`：Chrome初版19项通过。最终含2项旧链接跳转共**Chrome21项、WebKit21项通过**（`browser-final.log`及`webkit-final.log`），均为API夹具。WebKit首次在默认全局缓存找不到可执行文件，21项启动失败；改用已存在的`.data/playwright`缓存后21项全部通过，没有安装依赖。初次完整结果保存在`browser-initial-results.json`。没有通过浏览器真实新建用户或发送邮件。
- `mysql-registration.log`：真实MySQL新编译服务注册/登录回滚通过；`activation.log`：授权过渡1/审计1；`activation-idempotency.log`：重跑0/审计0。`PolicyCheck.java`保留回滚与过渡验证入口，`Inspect.java`仅只读；不得把apply当日常回归动作。
- requesting-code-review独立只读复查发现文件真实验收旧emailVerified=true断言，已改false并更名；其余指定实现/合同/迁移无重要问题。未运行完整隔离库文件/密码浏览器全链路，不冒称这些专项已重跑。

## 注册规则运行入口与待复核事项

**用户需在IDEA停止并重新运行CampusRadarApplication（8080）以加载新注册规则；不要另起JAR或由agent启停。** 当前真实账号已解除PENDING，可直接用原密码登录；后续新注册无需验证，需要新代码运行后才生效。前端5179继续使用热更新，无需重启。运行入口：[登录](http://127.0.0.1:5179/login)、[注册](http://127.0.0.1:5179/register)。找回密码仍用Mailpit38025；不再要求去Mailpit激活注册。

## 前次评论权限与运行复核（2026-10-31 12:22，历史保留）

- USER仅本人公开评论可撤回；ADMIN可撤回任意公开评论，必填原因并审计；REVIEWER/匿名无撤回。社区、面经、本人评论记录共用`comment-access.ts`和`comment-removal.tsx/css`；账号/角色隔离、AbortSignal、重复提交锁、版本冲突提示保留。
- 管理角色可公开阅读/community和/experiences并使用管理员撤回，不能访问私人投稿页或执行求职业务、发帖/评论/点赞/举报。`ApiShell`没有放宽USER私有路由guard；公开面经仅显示PUBLISHED。
- `SocialController.comment`旧PENDING幂等快照通过`SocialService.ownComment`读相同作者/主题的当前状态，返回原记录，不重建/强制发布/读他人行。
- 12:18用户重启IDEA后端PID33344，真实ADMIN评论列表200、ADMIN和USER撤回不存在UUID404、USER越权ADMIN删除403。此前旧进程PID22541（10:45:52）未加载新路由导致403，已解决。
- 经之前明确授权“历史待审评论也直接公开”，12:18后将旧进程遗留1条PENDING评论转PUBLISHED并追加actor=NULL系统审计，最终PENDING0、评论共3；旧幂等键真实回放201/PUBLISHED且总数仍3。没有新建、撤回或删除真实原评论。**此评论过渡已完成，不要重复执行。**
- 证据`.data/verification/comment-permissions/`：`runtime-before.json`保留旧403、`runtime-after.json`保留新200/404和越权403；data/recovery日志及`replay-live-results.json`保留数据/幂等证据。敏感临时回放文件已删除。
- 历史验证：12:09:56后端145项（143通过/2跳过），12:13:49前端27项/构建/格式通过，12:15:42两引擎×桌面亮/手机暗×USER/ADMIN/REVIEWER/匿名16组通过。浏览器写入均夹具；真实删除未验收。旧direct-comments4组也通过。当前全量测试结果见顶部，本轮没有重跑评论专项浏览器矩阵。

## 上轮直接发布/撤回/后台删除（继续保留）

2026-10-31 11:24完成社区/面经评论回复直接PUBLISHED、本人/me撤回、ADMIN评论列表/按原因删除，正文清除/HIDDEN而保留回复关系、8类非评论审核同步、合同182操作。REVIEWER仍可举报处理/HIDE，不能删除。上轮经用户明确选择，**真实转换1条PENDING为PUBLISHED、version+1并写1条actor NULL系统审计**，HIDDEN不动；当时pending0，之后旧进程又生成本轮所见1条，不重复混淆。证据`direct-comments/`与过渡SQL`docs/migrations/2026-10-31-comments-direct-publish.sql`。上轮144项142通过2跳过、前端26和浏览器4组是历史结果，本次已增加新兼容/权限验证。服务仍由用户重启加载。

## 此前社区投稿/评论子路由（继续保留）

2026-10-31 10:55完成社区入口`/submissions?type=POST`、独立`/submissions/comments`、管理`/submissions/community`（旧`/community/submissions`兼容）与左侧我的投稿高亮。commentContext按本页本人评论补全文、授权可见的原帖/回复上下文，隐藏他人未公开内容；公开原帖锚点跟随readAll全分页定位。此次保留上述结构，状态提示改为直接发布/显示状态并增加撤回。此前10:54的4组夹具与前端26/后端140通过2跳过是历史验证，本轮以direct-comments新脚本为准；旧审批断言不再适用。

## 上一次偏好设置重构（继续保留）

2026-10-31 00:15完成：新增settings-page/css，auth-api重导出，资料/求职偏好/外观时区/安全/数据管理五分类，桌面双列/手机横向导航单列；44px/手机16px/填写提示；单类保存、主题保存生效、密码重复确认。资料草稿在分类/同账号503重连时保留，409显式放弃本页输入重载；账号/角色切换隔离，等待CSRF取消旧写，密码不缓存。ADMIN/REVIEWER只有资料/外观/安全，不读取私人文件。

数据工具主面操作行＋任务进度，备份/文件/上传恢复按需Modal；恢复再置顶确认，RESTORE/RESET/DELETE口令＋密码重验证＋版本检查保留。任务跨分类继续；完成清空/恢复发account-changed清理其他模块缓存，再更新设置表单/版本。换账号取消旧备份下载。独立复查发现的下载取消/旧版本/缓存失效事件三项已修。

00:13:41两引擎4组、00:14:20前端26项/构建/格式通过；证据`settings-redesign/`。浏览器均夹具，没实际导出/恢复/清空/注销。手机保存可达性曾因scrollIntoViewIfNeeded只判断视口导致测试失败，真实滚动居中＋命中验证后通过，产品已有90px底部留白。设置页本身无Java改动，本次评论任务才需要加载后端新字段。

## 上一次同路人/情报/MySQL任务（继续保留）

- **同路人**：共享任务改独立Modal，关闭保留内存草稿/成功回焦preventScroll；邀请搜索独立label＋44px等高行。共用Modal补44px关闭按钮、嵌套层级/独立描述ID、可选内部空白保持输入焦点；同路人外侧不误关。用户明确内部空白跳顶，并确认页面旧标题“邀请同路人”；新版“邀请同伴”＋“添加任务”。旧useRemote轮询loading会卸载内容，有闪动/缩布局路径；新版后台刷新保留节点，内部点击和3×10秒未稳定复现持续闪动。不把外侧关闭问题冒充内部根因。`buddy-stability/`新4组通过，旧`buddy-layout/`内联任务脚本已过时。调试探针在buddy-stability目录。
- **情报雷达**：新radar-page/css主列表收敛标题/公司/类型/时间/核验/详情；正文、来源、核验日期、举报在Modal；真实分页/URL筛选、中文未知值降级、安全链接、PUBLISHED、SYNTHETIC保留，举报账号内存草稿/同key/取消。`radar-layout/`4组通过，共用Modal兄弟举报显式layer1。
- **MySQL1267修复**：`SubmissionService.projection`六分支仅统一`CAST(public_path表达式 AS CHAR(128))`；真实MySQL8.4.13只读先复现ascii_bin与utf8mb4_0900_ai_ci冲突并定位该列，保留其他列collation/作者过滤/分页/安全路径，未迁移表。不存在owner126组合＋常量中文emoji/null/路径验证，真实写入0。`SubmissionServiceTest`7＋显式`SubmissionMySqlTest`2；2026-10-30 23:44:57后端全量139通过、默认跳过2MySQL集成（另行启用2项已通过）。证据`submission-mysql/`，源码hash/SQL/README/日志保留；不是非空真实用户端到端验证。
- 上轮2026-10-30 23:56前端26项/构建通过、Buddy4＋雷达4正式组通过；上轮更新`02-pages`/`03-design`/`06-api`。本次未重跑这些独立页面专项。

## 此前页面改动（继续保留）

- **同路人/社区首轮重构**：此前新增Buddy独立页、我的/发现房间＋邀请栏、成员任务详情/房主操作/关闭退出确认、中文状态、账号隔离内存草稿/key和可见10秒轮询；社区作者/时间/正文/标签/紧凑互动＋引用评论，私稿继续子路由，写入贯穿signal。2026-10-30 23:25最终Buddy4组、21:45–21:46社区6布局＋4投稿、CSRF2组通过，26单测/构建；证据`buddy-layout/`、`community-layout/`、`social-signal/`。本轮任务表单改为Modal，旧`buddy-layout/check.mjs`仍假设内联任务，已由`buddy-stability/check.mjs`替代相关验证，不把旧脚本当本轮通过。

- **面经阅读布局**：2026-10-30 21:29完成`experience-reading.tsx/css`，广场真实公司/方向/轮次筛选＋URL/总数/分页，卡片信息层级；详情限宽摘要/安全Markdown/来源、面试信息侧栏/页内导航；评论真实分页、作者短ID/我/作者、引用回复、Modal、内存草稿/原key和继续回复入口。非公开正文始终隐藏、匿名策展作者非空判断，手机顶栏不折行。21:28新布局6组＋旧面经投稿4组、26单测/构建通过；证据`experience-reading/`和`submission-experiences/`。本轮未改这部分或重跑其浏览器专项。

- **公开投稿与本人子路由**：2026-10-30此前将社区动态/评论回复、面经/评论、薪资投稿收进Modal，公开只显示PUBLISHED；`/submissions`汇总六类记录及`/community/submissions`、`/experiences/submissions`、`/salary/submissions`、`/referral/submissions`。后端`GET /api/v1/me/submissions`会话作者白名单聚合、类型/状态/分页、匿名401/管理403，无迁移。草稿/幂等键账号隔离，编辑社区重新PENDING、面经回DRAFT再提交。2026-10-30 18:24:38后端138项通过，18:23–18:30社区/薪资/面经/Inbox共16组浏览器通过；证据`submission-*`与`submission-backend/`。此前面经4组回归已覆盖新阅读布局；本轮社区4组回归已重跑，新证据在community-layout/，其他旧证据不是本轮重跑。此前接口需IDEA重新加载才生效，本轮未查询其真实运行状态。

- **规划**：320px目标＋任务区/手机纵排、方向多选自填、目标日期自定义日历、每周1–80小时，真实任务分组/统计/筛选/搜索/编辑/确认删除，中文状态和字段示例。生成规则仍为每方向简历/基础知识/模拟面试三项，不覆盖已有记录，不宣称改变算法。任务409提供服务器对照与显式保留输入重试；503账号隔离内存草稿和原key。2026-10-30 13:05:59两引擎4组通过；证据`planner-redesign/`。
- **薪资/Offer引导**：薪资筛选/投稿对象独立；月薪×月数+奖金，任一未知则未知，确定0才填0；不足5完整样本隐藏分位，说明来源税前税后口径不可假定一致。Offer录入分组，至少2份/最多10份勾选比较、相对权重总和>0无需100，评分0–100与金额不自动转换；结果只显示服务器分数及覆盖率，保留CSV公式注入保护、409对照和失败草稿隔离。2026-10-30约13:00、13:03各4组通过；证据`salary-guidance/`、`offers-guidance/`。
- **日期弹层**：DatePicker352px/15px字/44px日期格，月年/键盘/今天清空/回焦、本地今天；可选层级供规划Modal使用。2026-10-30 12:24:22两引擎12组通过；`date-picker/`。
- **模拟练习题库**：真实方向/标签批量组题、5/10/20/30、知识点/难度/换题/手调、同方向不重复最多30，分页读题。2026-10-30 12:28:16题库12组、完整作答/轮次8场景通过；`practice-banks/`、`practice-and-rounds/`。
- **宝典**：256px目录＋限宽正文＋笔记，默认首章/URL导航、安全基础Markdown、409对照与账号隔离内存草稿；HTML转义，不支持完整扩展Markdown。2026-10-30 12:27两引擎12组、12:30匿名/ADMIN2组通过；`handbook-redesign/`。
- **既往布局/提示**：岗位筛选44px/响应式4–1列；投递统计顶部真实board.stats四色；导出栏等宽日期/44px；订阅技术字段中文化，年份2000–2100。既往证据`jobs-layout/`、`calendar-layout/`（旧原生日期检查已由DatePicker专项替代）、`subscription-feedback/`。
- Impeccable引擎此前缺失/缓存不可写，未运行其机械扫描或安装引擎；依据源码/现有设计/浏览器验证。中文路径均使用fileURLToPath，早前误建的桌面编码空目录已清理。

## 认证与系统边界（继续保留）

登录/注册共用`AnimatedAuthPage.tsx`父路由Canvas过渡；桌面55/45分栏，900px下隐藏Canvas，手机16px。注册昵称/邮箱/密码确认/可见性、失败重试/邮件受理，仅accepted=true才提示受理；切换清密码，记住邮箱只存邮箱。本轮已取消邮箱验证与重发，仅保留忘记/重置和角色回跳；昵称1–40、邮箱≤254、密码12–128。此前视觉轮次没有真实注册或发送邮件；本轮MySQL回滚注册验证见顶部。

2026-10-30认证白色扇区风险修复：混合值归零/归一、跳过不可见层、雷达扇区改描线、每帧恢复DPR/透明度/混合后清屏。修复前未稳定复现截图白像素，不声称证明Safari驱动问题。既往Retina两引擎各3通过/异常采样0，认证设计26场景通过；证据`auth-canvas-fix/`、`auth-transition/`。若真实Safari仍偶发白块，记录版本/尺寸/切换聚焦/GPU；本次未重跑认证专项。

| 身份 | 允许 | 禁止 |
| --- | --- | --- |
| USER | 公开内容、本人投递/收藏/简历/日程/练习/规划/投稿/账号 | 管理接口、审核发布、角色提升、他人私有数据 |
| ADMIN | 普通用户资料/状态；公共内容维护、审核/举报/服务/审计、基本设置 | 求职业务、他人私有笔记/附件、角色密码修改/管理账号冻结/绕过验证 |
| REVIEWER | 已提交内容审核、举报、必要目录读取、基本设置 | 求职业务、用户/服务管理、目录增删改、角色分配 |

角色不继承；管理默认`/admin`、用户`/me`；不能通过求职returnTo绕过。`RoleBoundary`以OpenAPI x-access中央鉴权，未知API默认拒绝；CurrentUser每次读取数据库角色/状态/会话代次。管理面经直接维护仅限策展内容，不能改写作者私稿。冻结普通账号更新auth_version并审计。首页/账号10秒复核、聚焦/可见重连；网络/5xx清空旧数据，不用模拟内容冒充响应。既往真实角色/停服检查见`role-boundaries/`，此前角色新增路由单测包含在138项内，此前MySQL兼容修复的全量检查为139项通过，2项显式MySQL集成单独执行。

## 数据与运行入口

数据库此前结构核对为2026-10-29 22:09：campus_radar共50表（49业务＋旧flyway_schema_history）。本轮2026-10-31过渡后ACTIVE账号ADMIN1个、USER2个、PENDING0；原有两个已验证测试账号：`admin@campusradar.test`、`user@campusradar.test`。密码Argon2id，凭据仅在git忽略/权限600的`.data/test-access.json`，不输出密码。已有授权SYNTHETIC测试企业8、岗位16、题16、章节4、情报4、来源1真实存库，前端取后端，不重复造数或建表；本轮MySQL修复仅以不存在owner和常量查询只读验证，不读取既有用户内容或写入真实数据库。

- IDEA打开`backend/pom.xml`，JDK21，运行`CampusRadarApplication`（8080），由用户启停。此前SubmissionService及评论修复已由后续IDEA进程加载；当前需重启用于本轮取消注册邮箱验证改动。不要启动替代JAR。
- 项目根`npm --prefix frontend run dev -- --port 5179 --strictPort`；现有前端未重启。离线测试在backend用`./mvnw -o -Dmaven.repo.local=../.data/maven-repository test`。Mailpit38025。
- 公开与投稿入口：[社区](http://127.0.0.1:5179/community)、[我的社区投稿](http://127.0.0.1:5179/community/submissions)、[面经](http://127.0.0.1:5179/experiences)、[我的面经投稿](http://127.0.0.1:5179/experiences/submissions)、[薪资](http://127.0.0.1:5179/salary)、[我的薪资投稿](http://127.0.0.1:5179/salary/submissions)、[我的内推投稿](http://127.0.0.1:5179/referral/submissions)、[全部投稿](http://127.0.0.1:5179/submissions)。
- 其他入口：`/planner`、`/offer-compare`、`/handbook`、`/mock`、`/subscriptions`、`/calendar`、`/jobs`、`/pipeline`、`/login`、`/register`均在同一5179前端。

每次任务结束更新本文件并提供链接。唯一目录保持不变，仅用户明确要求才创建工作树。

[运行说明](../README.md) · [页面](02-pages.md) · [设计](03-design.md) · [角色](01-product.md) · [数据库](05-database.md)
