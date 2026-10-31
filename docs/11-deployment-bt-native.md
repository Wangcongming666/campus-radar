# 宝塔原生部署：用户自行执行

2026-10-31。项目已按宝塔原生部署整理：用户在本机打包，自己上传并在宝塔完成上线；正式环境不用Docker。下面是当前唯一推荐流程，之前的Docker/systemd流程不再使用。

架构：后端放宝塔“网站→Java项目”；前端放“网站→HTML项目”；MySQL、Redis直接在宝塔软件商店原生安装；RabbitMQ若没有原生插件，通过宝塔终端安装官方系统软件包，不选择Docker应用。首次空库，先访问 http://39.107.60.14 。

## 1. Mac打包

本机需Java21、Node24。你可以直接在IDEA的Maven执行`clean package`，不必勾选release、不必再追加排除配置参数；默认JAR插件会排除dev/prod私有配置，但保留target/classes中的开发配置用于本地运行。

直接分开打包：

```bash
cd '/Users/wangcong/Desktop/校招雷达/backend'
./mvnw clean package
cd ../frontend
npm run build
```

后端产物`backend/target/campus-radar-0.1.0-SNAPSHOT.jar`，前端产物`frontend/dist/`。不要上传`.jar.original`、node_modules或源码。

推荐的完整上传包（会执行后端全量测试/打包、前端单测/构建，收集下面部署文件）：

```bash
cd '/Users/wangcong/Desktop/校招雷达'
python3 scripts/package-release.py --offline
```

若Maven缓存缺依赖，去掉`--offline`重新执行；前端依赖未安装时先执行`npm --prefix frontend ci`。脚本使用普通target目录，不改变你的IDEA打包产物位置。

脚本输出3份上传文件，实际文件名以输出为准：

- `.data/releases/campus-radar-native-时间戳.tar.gz`：JAR、静态前端、空库SQL、宝塔配置和本说明，**不含任何真实凭据或本机数据**。
- 同名`.tar.gz.sha256`：压缩包校验文件。
- `.data/releases/campus-radar-native-时间戳-application-prod.yml`：单独的私有生产配置，权限600，已填用户确认的服务信息。只上传到后端配置目录，不放进前端网站目录。

生产配置中若还有CHANGE_ME占位项，脚本会在构建前停止，避免把未完成配置当作可运行结果。原始私有配置一直保存在`backend/config/application-prod.yml`，已被Git忽略，后续更改应保留已有备份签名密钥。

## 2. 服务器安装基础软件

在宝塔“软件商店”安装Nginx、MySQL8.4、Redis（优先当前稳定版，项目此前实测Redis8）。MySQL选择极速安装，2GB服务器不要现场编译。不要选择MySQL5.7或MariaDB。MySQL8.4在宝塔的版本支持可见官方资料：[安装MySQL](https://docs.bt.cn/user-guide/database/mysql/install-mysql/)、[宝塔基础组件版本](https://blog.bt.cn/baota-panel-auto-deploy-website/)。

在截图页面点击“Java环境管理”，安装或添加JDK21。也可在Ubuntu22终端安装系统Java21，再在面板关联其路径：

```bash
apt-get update
apt-get install -y software-properties-common
add-apt-repository -y universe
apt-get update
apt-get install -y openjdk-21-jre-headless curl gnupg ca-certificates
/usr/bin/java -version
```

若系统有多个Java，确保Java项目实际选择21；不需要外装Tomcat。本项目JAR内置Web服务器。安装目录和JDK可执行文件以面板实际显示为准；下文完整命令假设`/usr/bin/java`已指向21。

2核约2GB只适合先少量试用；MySQL、Java、RabbitMQ、Redis及面板同机运行会比较紧。后端先用384MB堆，正式多人使用建议更多内存，尚无该服务器容量测试。

## 3. 当前RabbitMQ已安装，无需再安装或重置

用户已提供宝塔截图：RabbitMQ和管理Web服务均已开启。项目配置已按截图账号写入，连接127.0.0.1:5672，虚拟主机使用默认`/`。15672仅是管理网页端口，不能填为后端连接端口。

这次直接使用已有用户，无需执行以前创建campus_prod/campus_radar的命令。在RabbitMQ管理界面确认现有用户对`/`具有配置/读/写权限（一般是三项`.*`），或者在宝塔终端执行：

```bash
rabbitmq-diagnostics -q ping
rabbitmqctl list_user_permissions admin
```

若宝塔插件没有把命令加入PATH，用插件实际RabbitMQ安装目录下的工具，或在Web管理界面核对。截图状态不等于已验证Java能连接，最终以项目启动日志和异步任务验证为准。不要点击“重置RabbitMQ”。

## 4. 创建MySQL数据库、设置Redis

宝塔“数据库→添加数据库”：

| 项目 | 填写 |
| --- | --- |
| 数据库名 | campus_radar |
| 用户名 | campus_radar（若面板生成其他名称，后端配置改为实际用户名） |
| 密码 | 自己设置的强密码 |
| 字符集 | utf8mb4 |
| 访问权限 | 本地服务器 |

只创建这个专属空库，不把MySQL root写入应用配置。随后在数据库“导入”中上传打包得到的`database/schema.sql`并导入一次，成功后应有49张业务表、users表为空。**不要向非空库重复导入**。

用户已确认Redis无密码，后端配置已删除Redis password项，按127.0.0.1:6379、DB0连接，无需手动添加Key。确认Redis仅监听本机；无需为上线临时增加与配置不一致的密码。将来设置密码时，再同步更新生产配置并重启Java项目。小规模试用可设置maxmemory 64mb和maxmemory-policy noeviction。

MySQL通常3306、Redis6379、RabbitMQ5672；下方配置按这些原生端口，不使用旧Docker方案的33078/36380/35674。

## 5. 上传和放置文件

上传打包脚本输出的tar.gz、sha256、独立生产配置文件到服务器`/root/uploads/`，这里是临时上传区，不是网站根目录。

将下面`campus_bundle_name`改为脚本输出的实际包名（不含.tar.gz），以root在宝塔终端执行。只复制到项目目录，不会安装或启停任何服务：

```bash
bash <<'UPLOAD'
set -euo pipefail
campus_bundle_name=campus-radar-native-实际时间戳
cd /root/uploads
sha256sum -c "${campus_bundle_name}.tar.gz.sha256"
tar -xzf "${campus_bundle_name}.tar.gz"
cd "$campus_bundle_name"
sha256sum -c SHA256SUMS
bash baota/prepare-directories.sh
cp backend/app.jar /www/server/campus-radar/backend/app.jar
cp -R frontend/. /www/wwwroot/campus-radar/
install -m 640 -o root -g www "../${campus_bundle_name}-application-prod.yml"   /www/server/campus-radar/config/application-prod.yml
UPLOAD
```

如果用宝塔文件管理器手动上传，目录对应关系如下：

| 文件 | 服务器位置 |
| --- | --- |
| JAR（上传后重命名app.jar） | /www/server/campus-radar/backend/app.jar |
| frontend里的内容，index.html直接位于网站根 | /www/wwwroot/campus-radar/ |
| 独立生产配置，上传后重命名application-prod.yml | /www/server/campus-radar/config/application-prod.yml |
| database/schema.sql | 宝塔专属空库中导入一次，勿放网站目录 |

后续更新时，跳过上面install生产配置那一行，保留服务器现有配置和签名密钥。已有生产环境更新前先停宝塔Java项目并备份；不要用此命令覆盖仍在写入的旧服务。首次没有旧服务时直接执行即可。

## 6. 已完成的生产配置

`backend/config/application-prod.yml`已完成用户提供信息的同步，打包时独立导出，不在JAR和前端静态文件内：

| 设置 | 当前值 |
| --- | --- |
| MySQL | 127.0.0.1:3306/campus_radar，用户campus_radar，密码已填 |
| Redis | 127.0.0.1:6379，DB0，无密码 |
| RabbitMQ | 127.0.0.1:5672，截图提供的现有账号，默认虚拟主机/ |
| 站点和Origin | http://39.107.60.14 |
| 私有文件 | /www/server/campus-radar/private-files，由www用户读写 |
| 邮件 | 尚未配置正式SMTP，找回密码/邮件订阅禁用；注册直接登录可用 |
| 备份签名密钥 | 已生成并保存，不随发版重生成 |

如果服务器实际端口或RabbitMQ虚拟主机与上述不同，请在**这份外部配置**中改为实际值。无需重新打JAR，但要在宝塔重启Java项目。不要把服务地址写成你Mac的本地端口，也不要把MySQL root账户放入应用配置。

## 7. 在截图的Java项目页面添加后端

点击“添加项目”，选择SpringBoot/JAR类型。字段名称可能随宝塔版本略有区别，按含义填写：

| 项目 | 值 |
| --- | --- |
| 项目名称 | campus-radar-api |
| JAR文件 | /www/server/campus-radar/backend/app.jar |
| 项目根目录/工作目录 | /www/server/campus-radar/backend |
| JDK版本 | 21 |
| 项目端口 | 8080 |
| 运行用户 | www |
| 外网映射/域名绑定 | 暂不开启；公网IP由前端HTML项目绑定 |
| 开机启动/守护 | 若面板提供则开启 |

现成命令文件`deploy/baota/java-command.txt`（包内baota/java-command.txt）。完整启动命令如下，实际Java路径按面板选中的JDK21调整：

```bash
/usr/bin/java -Xms128m -Xmx384m -Xss512k -XX:MaxMetaspaceSize=192m -XX:ReservedCodeCacheSize=64m -XX:MaxDirectMemorySize=64m -XX:+ExitOnOutOfMemoryError -jar /www/server/campus-radar/backend/app.jar --spring.profiles.active=prod --spring.config.additional-location=file:/www/server/campus-radar/config/application-prod.yml
```

若面板将参数拆开填写：JVM参数为`-Xms...`至`-XX:+ExitOnOutOfMemoryError`，必须在`-jar`之前；项目参数为`--spring.profiles.active=prod --spring.config.additional-location=file:/www/server/campus-radar/config/application-prod.yml`，放JAR之后。不要只保留默认java -jar，不然不会加载生产配置。不要把敏感密码写在启动命令里。

保存并启动项目，看项目日志，待显示Started CampusRadarApplication，再在宝塔终端验证：

```bash
curl -i http://127.0.0.1:8080/api/v1/public/stats
```

应返回HTTP200。后端只提供API，不要期待8080直接显示完整前端。此前如执行过旧systemd方案，应先停止并禁用旧campus-radar服务，避免同一8080启动两份后端；不要删除数据库卷或数据。

## 8. HTML项目配置前端

“网站→HTML项目→添加项目”：IP/域名填`39.107.60.14`，根目录`/www/wwwroot/campus-radar`，端口80。前端不用Node进程，也不需要运行Vite。

打开HTML站点“设置→配置文件”，使用包内`baota/nginx.conf`（源码`deploy/baota/nginx.conf`）作为这个新静态站的完整配置，保存前检查并重载Nginx。不要替换Nginx全局主配置，不要配置到Java项目的外网映射里。

现成配置已设置：网站根/www/wwwroot/campus-radar、/api/原样代理127.0.0.1:8080、真实代理头、101MB上传上限、前端路由刷新回退index.html、静态资源缓存、index不缓存和证书验证路径。

不要给Java项目再把同一IP绑定80，也不要额外创建重复的/api反向代理。前端不需要Node进程或Vite，数据库和私有文件不放网站根目录。

## 9. 安全组及验收

阿里云安全组与宝塔防火墙放行TCP80。3306、6379、5672、8080不开放公网。访问 http://39.107.60.14 ，不要误用https。HTTP尚未提供传输加密，正式用户使用前应配置域名/证书。

依次人工检查：注册→直接登录→刷新保持会话→新建记录后刷新仍在→上传小附件→后台任务正常。空库没有本机测试账号/岗位/题库；自行注册，后台录入正式内容。若出现502，先看Java项目状态和日志；403 Origin错误检查浏览器地址与allowed-origins是否完全一致。

需要首个管理员时，先在网站注册自己的账号，然后在宝塔数据库工具对这个专属库执行下面事务，替换邮箱；没有符合条件的账号时不会修改任何用户：

```sql
START TRANSACTION;
SET @target=(SELECT id FROM users WHERE email='替换为你注册的邮箱' AND status='ACTIVE' AND role='USER' FOR UPDATE);
UPDATE users SET role='ADMIN',auth_version=auth_version+1,version=version+1 WHERE id=@target;
INSERT INTO audit_logs(id,actor_id,action,target_type,target_id,reason,request_id,change_summary)
SELECT UUID(),NULL,'PRODUCTION_ADMIN_BOOTSTRAP','USER',id,'服务器持有者授权管理员',UUID(),JSON_OBJECT('role','ADMIN') FROM users WHERE id=@target;
COMMIT;
SELECT IF(@target IS NULL,'MISSING','OK') AS result;
```

然后退出并重新登录，访问/admin。管理账号和普通求职账号权限分开。

## 10. 更新与备份

更新时：先在宝塔停止Java项目，备份数据库和`/www/server/campus-radar/config`、`private-files`，再替换JAR和前端静态文件，最后在面板启动Java项目。数据库用宝塔“数据库→备份”保管；SQL和私有文件应在停写期间一起备份。不要覆盖生产配置、重建已存在的库或重新生成备份密钥。

将来改HTTPS时，保留宝塔生成的证书配置，更新public-url、allowed-origins为实际https域名，并设置session.cookie.secure=true，然后在Java项目中重启。未配置SMTP前注册不受影响，找回密码/邮件订阅不能发送。

## 验证范围

本机代码与构建验证结果见最新HANDOFF。项目已提供固定配置与原生上传包，但尚未操作目标服务器，不能把本机构建成功等同于云端上线。用户按本流程完成上传、数据库导入和宝塔配置后，执行第9步验证。普通Maven package默认不含环境私密配置，本地IDEA运行所需的target/classes开发资源仍保留。
