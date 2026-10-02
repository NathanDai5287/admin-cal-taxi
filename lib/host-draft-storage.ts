import { EMPTY_STATE, sharedStateFromSnapshot, type SharedState } from "./host-state-model";
const POINTER = "admin.host.active-draft.v2";
const LEGACY = "admin.host.shared.v1";
export const HOST_DRAFT_SELECTED_EVENT = "host:draft-selected";
export const draftKey = (id: string) => `admin.host.draft.v2.${id}`;
/** Tell an already-mounted Host workspace that an archived order selected a new draft. */
export function notifyDraftSelected(id: string) {
  window.dispatchEvent(new CustomEvent(HOST_DRAFT_SELECTED_EVENT, { detail: id }));
}
/** Active pointer is tab-local; draft contents have an immutable UUID owner. */
export function beginDraft(data: SharedState, orderVersion?: string): string {
  const id = crypto.randomUUID();
  localStorage.setItem(draftKey(id), JSON.stringify({ ...data, documentContextId: data.currentOrderId ? (data.documentContextId || data.currentOrderId) : data.orderCreateRequestKey && data.documentContextId ? data.documentContextId : id }));
  sessionStorage.setItem(POINTER, id);
  if (orderVersion) sessionStorage.setItem(`${draftKey(id)}.order-version`, orderVersion);
  return id;
}
export function draftOrderVersion(id: string): string | undefined {
  return sessionStorage.getItem(`${draftKey(id)}.order-version`) ?? undefined;
}
export function setDraftOrderVersion(id: string, value: string) {
  sessionStorage.setItem(`${draftKey(id)}.order-version`, value);
}
export function readDraft(id: string): SharedState | null {
  try {
    const value = JSON.parse(localStorage.getItem(draftKey(id)) ?? "null");
    if (!value || typeof value !== "object") return null;
    const clean = sharedStateFromSnapshot(value);
    return { ...clean, currentOrderId: typeof value.currentOrderId === "string" ? value.currentOrderId : "",
      loadedOrderIdentity: typeof value.loadedOrderIdentity === "string" ? value.loadedOrderIdentity : "",
      orderCreateRequestKey: typeof value.orderCreateRequestKey === "string" ? value.orderCreateRequestKey : "",
      orderDraftIntent: value.orderDraftIntent === "edit" || value.orderDraftIntent === "preview" ? value.orderDraftIntent : "",
    };
  } catch { return null; }
}
export function activeDraft(): string {
  const active = sessionStorage.getItem(POINTER);
  if (active && readDraft(active)) return active;
  let data = structuredClone(EMPTY_STATE);
  try {
    const old = JSON.parse(localStorage.getItem(LEGACY) ?? "null");
    if (old && typeof old === "object") {
      data = sharedStateFromSnapshot(old);
      if (!old.overrides) {
        for (const key of ["finalPrice", "depositAmount", "maxGuests"] as const) {
          data.overrides[key] = data[key].trim() !== "";
        }
      }
      if ((old.orderDraftIntent === "edit" || old.orderDraftIntent === "preview") && typeof old.currentOrderId === "string") {
        data = { ...data, currentOrderId: old.currentOrderId, orderDraftIntent: old.orderDraftIntent, loadedOrderIdentity: typeof old.loadedOrderIdentity === "string" ? old.loadedOrderIdentity : "", orderCreateRequestKey: typeof old.orderCreateRequestKey === "string" ? old.orderCreateRequestKey : "" };
      }
    }
  } catch { /* corrupt legacy draft */ }
  const id = beginDraft(data);
  localStorage.removeItem(LEGACY);
  return id;
}
export function retireDraft(id: string) {
  localStorage.removeItem(draftKey(id));
  sessionStorage.removeItem(`${draftKey(id)}.order-version`);
  if (sessionStorage.getItem(POINTER) === id) sessionStorage.removeItem(POINTER);
}
export function retireOrderDrafts(orderId: string) {
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith("admin.host.draft.v2.")) continue;
    const id = key.slice("admin.host.draft.v2.".length);
    if (readDraft(id)?.currentOrderId === orderId) retireDraft(id);
  }
}
