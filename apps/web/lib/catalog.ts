import type { HttpAdapter } from './api/adapter';
import { setApiCatalog as replace, resetApiCatalog as clear, type Catalog } from './data';
const listeners = new Set<() => void>();
let revision = 0;
export const subscribeCatalog = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getCatalogRevision = () => revision;
function changed() {
  revision++;
  listeners.forEach((listener) => listener());
}
export function setApiCatalog(value: Catalog) {
  replace(value);
  changed();
}
export function resetApiCatalog() {
  clear();
  changed();
}
export async function loadCatalog(adapter: HttpAdapter, signal?: AbortSignal) {
  const catalog = await adapter.catalog(signal);
  if (!signal?.aborted) setApiCatalog(catalog);
  return catalog;
}
