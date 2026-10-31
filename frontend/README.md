# React 前端

React 19 / TypeScript / Vite 8，Node 24。默认入口 `src/app/api-routes.tsx` 的 39 个路由使用真实 API、Cookie 会话、CSRF 和服务端数据。

后端在 IDEA 直接运行 `CampusRadarApplication`，默认读取 `application-dev.yml`；依赖和首次空库准备见 [开发指南](../docs/08-development.md)。后端运行于 8080 后，在项目根目录启动前端：

```sh
npm --prefix frontend ci
npm --prefix frontend run dev -- --port 5179
```

打开 `http://127.0.0.1:5179`，Vite 将 `/api` 代理到后端。也可使用根目录可选的一键启动脚本 `./scripts/start-local.sh --dev`。

前端目录内的常用检查：

```sh
npm run generate:api
npm run typecheck
npm test
npm run build
```

`src/api/generated.ts` 从 [OpenAPI](../docs/contracts/openapi.json) 生成；修改合同后重新生成。页面业务位于 `src/features/*-api.tsx`，客户端位于 `src/api/`，壳层和鉴权在 `src/app/api-shell.tsx`。

Playwright 真实验收需要独立测试数据与运行中的真实后端，入口和限制见 [测试说明](../docs/09-testing-release.md)。报告、截图与浏览器产物位于忽略的 `qa/` 等目录。

`VITE_DEMO_MODE=true` 仅用于显式演示，默认构建不引入演示业务模块。最新验证结果见 [交接文档](../docs/HANDOFF.md)。
