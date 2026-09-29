type PayableNavigationPreview = {
  id: string;
  name: string;
  expense: string;
  amount: string;
  receiptUrl: string | null;
};

let currentPreview: PayableNavigationPreview | null = null;
const listeners = new Set<() => void>();
let expirationTimer: ReturnType<typeof setTimeout> | null = null;

export function setPayableNavigationPreview(preview: PayableNavigationPreview) {
  currentPreview = preview;
  if (expirationTimer) clearTimeout(expirationTimer);
  expirationTimer = setTimeout(() => {
    currentPreview = null;
    listeners.forEach((listener) => listener());
    expirationTimer = null;
  }, 4 * 60_000);
  listeners.forEach((listener) => listener());
}

export function subscribeToPayableNavigationPreview(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPayableNavigationPreview() {
  return currentPreview;
}

export function getServerPayableNavigationPreview() {
  return null;
}
