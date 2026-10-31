import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./styles/global.css";
const Root = lazy(() =>
  import("./app/api-routes").then((m) => ({ default: m.ApiApp })),
);
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={<div className="loading-page">正在打开校招雷达…</div>}>
      <Root />
    </Suspense>
  </StrictMode>,
);
