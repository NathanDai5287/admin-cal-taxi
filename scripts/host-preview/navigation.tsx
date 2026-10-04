import { useSyncExternalStore } from "react";
export function navigate(href: string) {
  history.pushState(null, "", href);
  window.dispatchEvent(new Event("popstate"));
  window.scrollTo(0, 0);
}
export function usePathname() {
  return useSyncExternalStore(callback => { window.addEventListener("popstate", callback); return () => window.removeEventListener("popstate", callback); }, () => location.pathname, () => "/host");
}
const router = { push: navigate, replace: navigate, prefetch() {}, refresh() { window.dispatchEvent(new Event("preview-data")); } };
export function useRouter() { return router; }
