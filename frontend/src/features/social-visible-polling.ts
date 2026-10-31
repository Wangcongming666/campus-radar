type VisibleSurface = Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;

/** Keep shared room data fresh while its browser document is visible. */
export function startVisiblePolling(refresh: () => void, surface: VisibleSurface = document) {
  let disposed = false;
  const refreshVisible = () => { if (!disposed && surface.visibilityState === "visible") refresh(); };
  const timer = setInterval(refreshVisible, 10000);
  surface.addEventListener("visibilitychange", refreshVisible);
  return () => {
    disposed = true;
    clearInterval(timer);
    surface.removeEventListener("visibilitychange", refreshVisible);
  };
}
