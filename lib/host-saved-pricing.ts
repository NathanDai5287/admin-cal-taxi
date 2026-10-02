import type { PricingBreakdown } from "./host-state-model";
/** Never invent historical charges or pass partial data into the invoice builder. */
export function savedPricing(value: unknown): PricingBreakdown | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const numbers = ["base", "capacity", "firePermit", "alcohol", "protection", "date", "setup", "cleanup", "total", "guests", "capacityThreshold", "perGuestRate"];
  if (!numbers.every(key => typeof raw[key] === "number" && Number.isFinite(raw[key]) && Number(raw[key]) >= 0)) return null;
  const labels = Object.fromEntries(["alcoholLabel", "protectionLabel", "dateLabel", "setupLabel", "cleanupLabel"].map(key => [key, typeof raw[key] === "string" ? raw[key] : ""]));
  return { ...raw, ...labels } as PricingBreakdown;
}
