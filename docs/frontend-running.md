# 启程校招前端运行说明

## 环境要求

- Node.js 24 或更高版本
- pnpm 11.19 或兼容版本
- Chrome、Edge 或 Safari 的近期版本

## 安装与启动

在项目根目录执行：

```bash
pnpm install
pnpm dev:web
```

学生端默认地址为 `http://localhost:5173`。

另开一个终端启动运营后台：

```bash
pnpm dev:admin
```

运营后台默认地址为 `http://localhost:5174`。

## 演示身份

- 学生邮箱：`student@example.com`
- 邮箱验证码：`246810`
- 超级管理员：`admin@example.com`
- 内容运营：`operator@example.com`
- 后台演示密码：`demo-admin`

前端阶段不会发送真实邮件，也不会把账号信息传到服务器。页面数据保存在浏览器中；如需恢复演示数据，请清理当前站点的 Local Storage 后刷新页面。

## 质量命令

```bash
pnpm typecheck
pnpm test
pnpm build
```

`pnpm build` 会分别生成 `apps/web/dist` 和 `apps/admin/dist`。
