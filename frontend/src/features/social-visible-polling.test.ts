import { afterEach, expect, test, vi } from "vitest";
import { startVisiblePolling } from "./social-visible-polling";
class Surface extends EventTarget { visibilityState: DocumentVisibilityState = "visible"; }
afterEach(() => vi.useRealTimers());
test("shared room polling pauses in the background and refreshes immediately on return", () => {
  vi.useFakeTimers(); const surface = new Surface(), refresh = vi.fn();
  const stop = startVisiblePolling(refresh, surface);
  vi.advanceTimersByTime(10000); expect(refresh).toHaveBeenCalledTimes(1);
  surface.visibilityState = "hidden"; surface.dispatchEvent(new Event("visibilitychange"));
  vi.advanceTimersByTime(30000); expect(refresh).toHaveBeenCalledTimes(1);
  surface.visibilityState = "visible"; surface.dispatchEvent(new Event("visibilitychange"));
  expect(refresh).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(10000); expect(refresh).toHaveBeenCalledTimes(3); stop();
});
test("closed room views remove their timer and foreground listener", () => {
  vi.useFakeTimers(); const surface = new Surface(), refresh = vi.fn();
  const stop = startVisiblePolling(refresh, surface); stop();
  vi.advanceTimersByTime(30000); surface.dispatchEvent(new Event("visibilitychange"));
  expect(refresh).not.toHaveBeenCalled();
});
