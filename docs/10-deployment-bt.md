# 校招雷达：Ubuntu 22 + 宝塔部署完整流程

> 此为此前Docker依赖＋systemd方案。用户最新选择完全不用Docker，Java由宝塔管理；请改看[宝塔原生部署指令](11-deployment-bt-native.md)，不要执行本文旧流程。

本流程对应本项目当前代码。首次部署采用**空数据库、直接IP访问**，地址为 `http://39.107.60.14`。前端使用构建后的静态文件，后端使用Java 21可执行JAR，MySQL 8.4、Redis 8、RabbitMQ 4.4由Docker Compose管理。宝塔只负责Nginx站点，不需要PHP、Node项目管理器或另一套MySQL。

本机已准备的发布包不含账号、业务数据、上传文件、开发密码或服务器运行密钥。服务器上首次生成新的配置。本说明中的服务器命令在**宝塔终端或SSH的root会话**执行；“本机”命令在Mac项目目录执行。尚未实际连接或部署到服务器，验证范围以交接为准。

## 1. 先确认服务器条件

截图为2核、约2GB内存、40GB磁盘。下面提供小规模试用配置，但Java、MySQL、RabbitMQ、Redis和宝塔共用这点内存会很紧。正式供多人使用建议至少4GB；这属于本项目部署预算判断，不是已完成的容量测试。发布包在Mac构建，服务器无需安装Node/Maven，也不在服务器编译。

在服务器执行：

```bash
free -h
df -h /
swapon --show
uname -m
```

建议可用磁盘至少10GB，用于镜像、数据库、日志、发布包和备份。若仍使用2GB且没有swap，可以创建独立2GB swap文件（已有swap时跳过；已有同名文件时停止核对）：

```bash
bash <<'SWAP'
set -euo pipefail
if swapon --noheadings --show=NAME | grep -q .; then
  echo '已有swap，本步骤跳过。'
elif test -e /swap-campus; then
  echo '已有/swap-campus，请先人工核对，未修改。' >&2
  exit 1
else
  fallocate -l 2G /swap-campus
  chmod 600 /swap-campus
  mkswap /swap-campus
  swapon /swap-campus
  printf '/swap-campus none swap sw 0 0\n' >> /etc/fstab
fi
SWAP
```

逐行执行，上一行失败不要继续。swap不能替代物理内存；大附件、备份恢复和多人并发须监测内存。发布服务默认Java堆384MB、进程上限768MB；100MB文件相关操作仍可能需要更大内存。升级服务器后可用`systemctl edit campus-radar`调整服务限制和ExecStart，不要同时运行另一份后端。

## 2. 安装服务器运行环境

宝塔“软件商店”安装**Nginx**。已有Nginx就使用现有版本，避免再用apt安装第二套。此方案不使用宝塔数据库安装器；数据库由下面的专属Compose服务提供。

安装Java 21和基础工具。Ubuntu 22的`universe`仓库提供OpenJDK 21：

```bash
apt-get update
apt-get install -y software-properties-common ca-certificates curl python3 gzip tar util-linux
add-apt-repository -y universe
apt-get update
apt-get install -y openjdk-21-jre-headless
/usr/bin/java -version
```

最后一条必须显示21。如果已有其他Java版本，使用`update-alternatives --config java`选21。不要只安装Java 8/17。

先检查Docker：

```bash
docker version
docker compose version
```

两条都可用就跳过安装。宝塔已安装Docker但没有Compose时，可在宝塔Docker模块完成安装，或按Docker官方文档配置apt仓库；不要在有业务容器时盲目卸载现有Docker。**仅完全未安装Docker时**可在Ubuntu 22执行官方apt仓库流程：

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' "$(dpkg --print-architecture)" "$VERSION_CODENAME" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker compose version
```

镜像下载失败时，按云平台提供的可信镜像加速文档配置Docker。Mac的镜像不能直接假定与云服务器CPU架构相同，本包由服务器自行拉取镜像。

## 3. 本机打包，以及需要上传什么

当前项目目录：`/Users/wangcong/Desktop/校招雷达`。本机需要JDK21、Node24及现有依赖。重新生成发布包：

```bash
cd '/Users/wangcong/Desktop/校招雷达'
python3 scripts/package-release.py --offline
```

`--offline`使用本机已有Maven仓库；仓库确实缺依赖时去掉该参数并联网构建。首次缺少前端依赖时先执行`npm --prefix frontend ci`。脚本自动执行后端全量测试/打包、前端单测/构建，输出：

```text
.data/releases/campus-radar-时间戳.tar.gz
.data/releases/campus-radar-时间戳.tar.gz.sha256
```

每次时间戳不同，请使用脚本输出的实际名称。JAR采用独立`release`构建目录`.data/build/backend-release`，不会清空IDEA的`backend/target/classes`。脚本检查JAR不包含`application-dev.yml`，并按白名单打包：

| 发布包内容 | 用途 |
| --- | --- |
| `frontend/` | Vite构建后的HTML、JS、CSS、字体等，直接由Nginx读取 |
| `backend/app.jar` | Java21后端，包含当前API合同 |
| `database/schema.sql` | 新空库49张业务表，不含本机数据 |
| `ops/compose.yml`及依赖配置 | 服务器专属MySQL、Redis、RabbitMQ |
| `ops/configure.py` | 生成服务器配置和新密码/密钥 |
| `ops/campus-radar.service`、`ops/bin/` | 常驻启动、建库、管理员、备份、检测 |
| `README-部署.md`、`release.json`、`SHA256SUMS` | 本流程、发布信息、包内校验 |

**只需上传压缩包和同名`.sha256`文件**到服务器`/root/uploads/`，不用上传整个项目、node_modules、.data、开发YAML或本机数据库。宝塔左侧“文件”可以上传；也可以本机执行以下命令并把示例文件名换成实际包名：

```bash
ssh root@39.107.60.14 'mkdir -p /root/uploads'
scp .data/releases/campus-radar-时间戳.tar.gz .data/releases/campus-radar-时间戳.tar.gz.sha256 root@39.107.60.14:/root/uploads/
```

服务器解压（仍将示例文件名换成实际名称）：

```bash
cd /root/uploads
sha256sum -c campus-radar-时间戳.tar.gz.sha256
mkdir -p /opt/campus-radar/releases
tar -xzf campus-radar-时间戳.tar.gz -C /opt/campus-radar/releases
cd /opt/campus-radar/releases/campus-radar-时间戳
sha256sum -c SHA256SUMS
```

应全部显示OK。不要把整个发布包解压到Nginx网站根目录，网站根目录只指向其中的`frontend/`。

## 4. 首次生成生产配置

在刚解压的发布目录执行：

```bash
python3 ops/configure.py init --origin http://39.107.60.14
bash ops/bin/install-service.sh
```

生成配置目录`/opt/campus-radar/shared/config/`，密码不显示在控制台：

- `application-prod.yml`：后端数据连接、唯一允许的Origin、Cookie、文件路径和备份签名密钥；内容为合法JSON形式的YAML，Java可直接读取。
- `dependencies.env`：Docker数据库、Redis、RabbitMQ密码，权限600，仅服务器持有者读取。
- `nginx-site.conf`：按当前IP生成的Nginx站点配置，不含密码。

生成器拒绝覆盖已有配置；以后更新版本不能重新生成密钥。安装脚本创建独立系统用户`campus-radar`、`current`版本软链接，安装并启用systemd服务，**此时不会启动后端**。应用配置权限640、目录750，供服务用户读取；私有文件目录700。数据目录不在发布目录里，升级不会替换它。

HTTP阶段SESSION Cookie必须`secure=false`，否则浏览器不会在HTTP登录时回传会话。后续HTTPS切换时改成true。后端仅监听127.0.0.1:8080；请求从Nginx转发并校验准确的站点Origin，不需要开放8080公网端口。

## 5. 启动数据库、中间件并导入空表结构

```bash
bash /opt/campus-radar/current/ops/bin/compose.sh up -d --wait
bash /opt/campus-radar/current/ops/bin/compose.sh ps
bash /opt/campus-radar/current/ops/bin/init-db.sh
```

首次镜像拉取和MySQL初始化可能需要几分钟。`--wait`等待健康检查；失败先看下一节日志，不要马上执行建表。

初始化脚本要求数据库完全没有表，导入`database/schema.sql`后应显示**49**张表，并把业务账号权限收紧为SELECT/INSERT/UPDATE/DELETE。它不会创建测试账号、测试岗位、管理员或默认密码。数据库已有任何表就拒绝执行；不要重复导入或用“删除数据卷”解决重试。

| 服务 | 服务器本机地址 | 持久化位置 |
| --- | --- | --- |
| MySQL8.4 | `127.0.0.1:33078`，库`campus_radar_prod` | Docker卷`campus_radar_prod_mysql` |
| Redis8 | `127.0.0.1:36380` | Docker卷`campus_radar_prod_redis` |
| RabbitMQ4.4 | `127.0.0.1:35674` | Docker卷`campus_radar_prod_rabbitmq` |
| 私有附件/账号备份原件 | 不提供静态URL | `/opt/campus-radar/shared/private-files` |

Redis用于会话和限流，RabbitMQ用于异步任务，两者都不能省略。生产不启动Mailpit或RabbitMQ管理面板。重启容器会保留命名卷，切勿使用`docker compose down -v`。

## 6. 启动Java后端

```bash
systemctl start campus-radar
systemctl status campus-radar --no-pager
journalctl -u campus-radar -n 100 --no-pager
curl -i http://127.0.0.1:8080/api/v1/public/stats
```

最后一条应返回HTTP200和真实空库统计。服务使用显式`prod`环境及外部配置，不读取开发环境密码。systemd负责开机启动、异常重启和日志；不需要用`nohup`另开一份，也不要再通过宝塔Java管理器重复启动同一个JAR。

若依赖未就绪导致服务连续失败，先检查：

```bash
bash /opt/campus-radar/current/ops/bin/compose.sh ps
bash /opt/campus-radar/current/ops/bin/compose.sh logs --tail 80 mysql redis rabbitmq
systemctl reset-failed campus-radar
systemctl restart campus-radar
```

不要把包含配置或凭据的输出直接公开。`docker compose config`会展开密码，检查时使用`config --quiet`。

## 7. 宝塔新建网站，配置前端和API

1. 宝塔左侧“网站”→“添加站点”，域名栏填写`39.107.60.14`（不写`http://`），类型选纯静态，PHP不启用，不创建宝塔数据库。
2. 网站根目录设为`/opt/campus-radar/current/frontend`；如面板先要求创建默认根目录，建好后在站点“网站目录”修改为此路径。
3. 打开该站点“设置”→“配置文件”，先备份面板原配置，再把下面命令显示的内容作为这个新站点的完整配置保存。不要粘贴到Nginx全局主配置。

```bash
cat /opt/campus-radar/shared/config/nginx-site.conf
```

4. 配置已经包含`/api/`反向代理，不要再通过宝塔“反向代理”生成第二条同路径规则；不设置到Vite5179的代理。
5. 在宝塔执行配置检查并重载Nginx，或在服务器执行：

```bash
/www/server/nginx/sbin/nginx -t
/www/server/nginx/sbin/nginx -s reload
```

这里的Nginx路径适用于宝塔常规安装；若你的面板使用不同路径，使用面板检查/重载按钮。`/api/`原样转到8080，`try_files`使刷新`/login`、`/settings`等React路由时返回index.html，带hash的静态资源长期缓存而index.html不缓存。不要把API请求重写成前端HTML。

## 8. 开放访问端口与首次验收

在阿里云ECS安全组和宝塔防火墙中允许TCP80。SSH和宝塔管理端口只保留你自己访问所需范围；后续HTTPS再开放443。**不需要开放**8080、33078、36380、35674或Docker管理端口，它们只监听服务器回环地址。

在浏览器地址栏输入完整的`http://39.107.60.14`。没有域名/证书时不要输入`https://`。如果看到Nginx欢迎页，检查新站点的IP绑定是否命中、是否有同IP默认站点抢占。

服务器执行只读冒烟检查：

```bash
python3 /opt/campus-radar/current/ops/bin/smoke.py http://39.107.60.14
```

应依次显示`/login`200、`/register`200、公开统计200、CSRF200、匿名`/me`401。然后人工确认：

1. 打开注册页，创建你自己的正式账号；无需验证邮箱。
2. 直接用原邮箱/密码登录，进入个人中心。
3. 刷新页面仍保持登录；新建一条私人记录，刷新后仍在。
4. 用第二个浏览器或无痕窗口确认私人页需登录。
5. 按下一节授权首个管理员，重新登录后可进入后台。
6. 暂停/启动后端可通过`systemctl`控制；正常整机重启后检查服务和容器自启。

当前使用HTTP，密码和会话不具备传输加密；这个地址适合先验证部署，准备真实用户使用时应完成HTTPS。此限制来自当前没有证书的访问方式。

## 9. 首个管理员与正式内容

本包没有`admin@campusradar.test`等本机账号。先在网站注册自己的账号，再用服务器持有者权限授权（把示例邮箱替换成你实际注册的邮箱）：

```bash
bash /opt/campus-radar/current/ops/bin/promote-admin.sh your-email@example.com
```

脚本仅处理指定的ACTIVE普通账号，更新角色/会话代次并写系统审计，不重置密码。之后退出并重新登录，访问`http://39.107.60.14/admin`。若仍需普通求职功能，另注册一个普通账号；管理角色与普通用户业务权限分开，不是管理角色自动继承所有求职功能。

空库的岗位、公司、题库、宝典、面经初始为空，这是正常状态。通过后台录入正式内容，不会自动把本机SYNTHETIC测试目录带上去。

## 10. 邮件功能以后再配置

当前生产配置的`campus.mail-key`为空，明确禁用邮件请求，注册和直接登录不受影响。忘记密码、邮件订阅需要真实SMTP；本机Mailpit不会投递到真实邮箱，不要把它作为公网邮件服务。

准备好SMTP服务后，在服务器编辑`/opt/campus-radar/shared/config/application-prod.yml`：

- `spring.mail.host/port/username/password`填写SMTP服务商参数；587通常使用STARTTLS，465通常使用SSL，以服务商说明为准。
- `spring.mail.properties`设置相应的`mail.smtp.auth`、`mail.smtp.starttls.enable`或`mail.smtp.ssl.enable`。
- `campus.mail-from`改为SMTP允许发送的地址，`campus.mail-key`使用`openssl rand -base64 32`生成的密钥并永久保管。
- 配置完成后`systemctl restart campus-radar`，用自己的邮箱测试找回密码和订阅送达。

`campus.backup-key`与邮件密钥都不要在每次发版时重新生成；否则已有签名备份/加密邮件可能无法校验或解密。不要把密钥文件放入网站目录。

## 11. 后续更新前后端

1. Mac再次运行`python3 scripts/package-release.py --offline`，上传新压缩包和校验文件，解压到新的`releases/版本`目录并校验。
2. 先备份当前数据库、文件、配置：

```bash
bash /opt/campus-radar/current/ops/bin/backup.sh
readlink -f /opt/campus-radar/current
```

记下当前版本路径。备份脚本会短暂停止后端，完成或失败退出时按原状态重新启动；备份完整时目录内存在`COMPLETE`和`SHA256SUMS`。只有停止API后才同时备份SQL和文件，避免两者对不上。备份目录权限700，但其中仍含正式个人数据和配置密钥，应下载到自己的加密存储，不应公开分享。

宝塔管理的站点配置、HTTPS证书及面板自身配置应另外使用宝塔备份功能保管；本脚本备份项目SQL、私有文件和运行配置，不包含整个面板。当前HTTP站点可由发布包的Nginx模板重建。

3. 停止后端，在新版本目录执行安装脚本，切换JAR和静态页面，再启动。把`新版本目录`换成实际名称：

```bash
systemctl stop campus-radar
cd /opt/campus-radar/releases/新版本目录
bash ops/bin/install-service.sh
systemctl start campus-radar
python3 ops/bin/smoke.py http://39.107.60.14
```

如果本次修改了依赖配置，先复核差异，再用`compose.sh up -d --wait`应用；普通代码发版不必重建依赖容器。不要重复运行`configure.py init`或`init-db.sh`；不要覆盖`shared`。本包的schema只用于首次空库，未来结构变更应配套专门迁移，不能整库重导。

## 12. 备份恢复和回滚

数据库与文件、配置必须一起保留。除了SQL，私有文件目录保存简历、录音等原件；只备份SQL无法恢复它们。Redis登录会话不必迁移，恢复后用户重新登录；RabbitMQ运行状态和未完任务需在恢复后通过后台复核，不能将恢复等同于所有外部邮件恰好发送一次。

**仅代码回滚**：确认本次没有不兼容数据库结构变化，再执行（把路径改成前面记录的旧版本）：

```bash
systemctl stop campus-radar
ln -sfn /opt/campus-radar/releases/旧版本目录 /opt/campus-radar/current
systemctl start campus-radar
python3 /opt/campus-radar/current/ops/bin/smoke.py http://39.107.60.14
```

**灾难恢复**应恢复到全新实例或明确清空且已保全现状的专属库，不要直接覆盖正在服务的数据库。概要步骤：

1. 校验备份目录的`SHA256SUMS`和`COMPLETE`，停止Java；保留故障现场，选择匹配的发布版本。
2. 在新服务器先恢复`config.tar.gz`到`/opt/campus-radar/shared`，暂时不解压私有文件。保留原密钥/依赖密码，选择匹配的发布版本，执行第4节的`install-service.sh`创建系统用户并恢复配置权限；**不要运行configure.py init**。配置归档同样只接受自己保管且完整校验过的备份。
3. 用恢复的`dependencies.env`启动全新的专属数据库/Redis/RabbitMQ。**不要执行init-db.sh**，SQL备份已包含表结构。
4. 确认Java保持停止，把完整备份目录传给恢复脚本：

```bash
bash /opt/campus-radar/current/ops/bin/restore-db-files.sh /备份目录
```

脚本启用严格错误处理，检查COMPLETE和校验和、目标数据库/私有文件目录均为空；数据库连接失败或目标非空立即终止，不执行导入。只接受private-files目录下的常规文件/目录，拒绝链接和路径穿越。导入SQL后再恢复文件，递归修复为新服务器的campus-radar用户：目录700、文件600，避免跨机器UID不同导致下载503。脚本失败或成功后均**不会启动Java**；失败后保留现场，不能向已有部分数据的目标库直接重复导入。

5. 检查数据库、配置和文件后再启动Java，配置Nginx，执行只读冒烟及登录/附件下载/后台任务复核。旧IP或域名变化时执行下一节`update-origin`。

## 13. 后续绑定域名、启用HTTPS

1. 在域名DNS为新域名添加A记录，指向39.107.60.14；大陆服务器使用域名公开建站通常还涉及云平台备案要求，应按你的接入商当前流程办理。
2. 宝塔站点“域名管理”添加实际域名，在“SSL”申请或安装证书，允许443并开启HTTP跳转HTTPS。让宝塔保留它生成的证书配置，继续保留第7节的API代理和SPA路由。
3. 在服务器更新应用Origin（用实际域名替换示例）：

```bash
python3 /opt/campus-radar/current/ops/configure.py update-origin --origin https://jobs.example.com
systemctl restart campus-radar
python3 /opt/campus-radar/current/ops/bin/smoke.py https://jobs.example.com
```

此命令只更新Origin/public-url和Secure Cookie，不重新生成密码或签名密钥；它也会更新本地的**HTTP引导模板**，不要再把这个模板覆盖宝塔已生成的HTTPS站点配置。已经在宝塔绑定域名即可。以后统一通过新域名访问，旧IP入口可跳转新域名，避免Origin不匹配。

## 14. 常见故障定位

| 现象 | 优先检查 |
| --- | --- |
| 外网打不开 | 云安全组80、宝塔防火墙、Nginx监听、IP站点绑定；浏览器是否误用HTTPS |
| Nginx欢迎页 | 新站点是否绑定IP、默认站点优先级、网站根目录 |
| 登录页刷新404 | Nginx是否保留`try_files ... /index.html` |
| API502 | Java服务是否启动、8080是否监听127.0.0.1、JRE是否21 |
| 登录403 ORIGIN_FORBIDDEN | 浏览器地址栏协议/主机/端口是否与allowed-origins完全一致 |
| 登录成功又变游客 | HTTP阶段Secure Cookie是否误设true、是否混用IP和localhost/域名 |
| API返回HTML/JSON解析失败 | `/api/`是否误被SPA重写、proxy_pass是否错误丢掉/api前缀 |
| 账号不存在 | 空库没有本机测试账号；先在服务器网站注册 |
| 私有文件上传失败/413 | shared目录所有权、Nginx101m上限、后端100MB限制 |
| 内存不足/频繁重启 | `journalctl -u campus-radar`、`docker stats --no-stream`、`free -h`、`journalctl -k`；2GB资源预算 |
| 邮件不可用 | 初始mail-key为空属预期，配置真实SMTP后再启用 |
| 后台任务卡住 | RabbitMQ健康状态、磁盘/内存告警、后台任务错误，勿删除队列冒充恢复 |

## 官方资料

配置方式已核对当前Spring Boot4.0文档；外部配置和显式profile用于避免开发配置进入生产：[Spring Boot外部配置](https://docs.spring.io/spring-boot/4.0/reference/features/external-config.html)。代理头使用原生Tomcat支持：[Spring Boot代理与转发头](https://docs.spring.io/spring-boot/4.0/how-to/webserver.html)。

Nginx反向代理和SPA回退分别参考[proxy_pass](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)、[try_files](https://nginx.org/en/docs/http/ngx_http_core_module.html#try_files)。依赖安装与健康等待参考[Docker Ubuntu安装](https://docs.docker.com/engine/install/ubuntu/)、[Compose启动与健康检查](https://docs.docker.com/compose/how-tos/startup-order/)。

数据库备份使用官方mysqldump事务选项：[MySQL8.4 mysqldump](https://dev.mysql.com/doc/refman/8.4/en/mysqldump.html)。RabbitMQ水位是触发流控的阈值，不是严格内存上限：[RabbitMQ内存阈值](https://www.rabbitmq.com/docs/memory)。Java包来源：[Ubuntu22 OpenJDK21 JRE](https://packages.ubuntu.com/jammy/openjdk-21-jre-headless)。
