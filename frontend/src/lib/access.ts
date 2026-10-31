export type AccountRole = "USER" | "REVIEWER" | "ADMIN";
export function isManagementRole(role?: string) {
  return role === "ADMIN" || role === "REVIEWER";
}
export function accountHome(role?: string) {
  return isManagementRole(role) ? "/admin" : "/me";
}
export function loginDestination(role: string, returnTo: string | null) {
  const safe =
    returnTo &&
    returnTo.startsWith("/") &&
    !returnTo.startsWith("//") &&
    !/[\\\u0000-\u001f]/.test(returnTo)
      ? returnTo
      : null;
  if (!safe) return accountHome(role);
  if (isManagementRole(role))
    return safe.startsWith("/admin") || safe.startsWith("/settings")
      ? safe
      : "/admin";
  return safe.startsWith("/admin") ? "/me" : safe;
}
