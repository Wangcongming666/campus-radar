import { useSyncExternalStore } from "react";
export type ThemePreference = "dark" | "light" | "system";
const media = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();
let preference: ThemePreference = "dark";
try {
  const saved = localStorage.getItem("radar-theme");
  if (saved === "dark" || saved === "light" || saved === "system")
    preference = saved;
} catch {
  /* A blocked preference store must not prevent page rendering. */
}
function resolvedTheme() {
  return preference === "system"
    ? media.matches
      ? "dark"
      : "light"
    : preference;
}
function publish() {
  document.documentElement.dataset.theme = resolvedTheme();
  listeners.forEach((listener) => listener());
}
media.addEventListener("change", publish);
window.addEventListener("storage", (event) => {
  if (event.key !== "radar-theme") return;
  preference =
    event.newValue === "light" || event.newValue === "system"
      ? event.newValue
      : "dark";
  publish();
});
publish();
export function setThemePreference(next: ThemePreference) {
  preference = next;
  try {
    localStorage.setItem("radar-theme", next);
  } catch {
    /* Theme still works for this tab. */
  }
  publish();
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function useTheme() {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => `${preference}:${resolvedTheme()}`,
  );
  const [selected, resolved] = snapshot.split(":");
  return {
    preference: selected as ThemePreference,
    resolved: resolved as "dark" | "light",
    setTheme: setThemePreference,
  };
}
