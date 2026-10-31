import type { components } from "./generated";
export type CurrentAccount = components["schemas"]["User"];
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message);
  }
}
export function reportApiUnavailable() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("campus:api-unavailable"));
}
let csrf: string | null = null;
let pendingCsrf: Promise<string> | null = null;
export function clearCsrf() {
  csrf = null;
  pendingCsrf = null;
}
export async function csrfToken(): Promise<string> {
  if (csrf) return csrf;
  if (!pendingCsrf)
    pendingCsrf = fetch("/api/v1/auth/csrf", {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok)
          throw new ApiError(
            response.status,
            "CSRF_UNAVAILABLE",
            "无法建立安全会话，请稍后重试。",
          );
        const body = (await response.json()) as { data: { token: string } };
        csrf = body.data.token;
        return csrf;
      })
      .finally(() => {
        pendingCsrf = null;
      });
  return pendingCsrf;
}
export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(method))
    headers.set("X-CSRF-TOKEN", await csrfToken());
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      method,
      headers,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    reportApiUnavailable();
    throw new Error("后端连接不可用，请确认服务已启动后重试。");
  }
  if (!response.ok) {
    if (response.status >= 500) reportApiUnavailable();
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string; requestId?: string };
    } | null;
    if (body?.error?.code === "CSRF_INVALID") clearCsrf();
    throw new ApiError(
      response.status,
      body?.error?.code ?? "REQUEST_FAILED",
      body?.error?.message ?? "操作失败，请稍后重试。",
      body?.error?.requestId,
    );
  }
  if (response.status === 204) return undefined as T;
  return ((await response.json()) as { data: T }).data;
}
export function currentAccount(signal?: AbortSignal) {
  return apiRequest<CurrentAccount>("/api/v1/me", { signal });
}
export async function login(email: string, password: string) {
  const user = await apiRequest<CurrentAccount>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  clearCsrf();
  await csrfToken();
  window.dispatchEvent(new Event("campus:account-changed"));
  return user;
}
export async function logout() {
  await apiRequest<void>("/api/v1/auth/logout", { method: "POST" });
  clearCsrf();
  window.dispatchEvent(new Event("campus:account-changed"));
  await csrfToken();
}
/** Only permit internal paths. Never trust the returnTo parameter as a URL. */
export function safeReturnTo(value: string | null, fallback = "/me") {
  return value &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\\\u0000-\u001f]/.test(value)
    ? value
    : fallback;
}
