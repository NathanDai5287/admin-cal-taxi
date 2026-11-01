export const DAMAGE_CATEGORIES = {
  damage: "Damage",
  plumbing: "Plumbing",
  cleaning: "Cleaning",
  missing_property: "Missing property",
  other: "Other",
} as const;

export type DamageCategory = keyof typeof DAMAGE_CATEGORIES;

export type DamageItem = {
  id: string;
  category: DamageCategory;
  description: string;
  amount: number;
  clubs: string[];
  position: number;
};

export type DamageEvidence = {
  id: string;
  itemId: string | null;
  filename: string;
  contentType: "image/jpeg";
  byteSize: number;
  caption: string;
  url: string;
};

export type DepositSettlement = {
  id: string;
  orderId: string;
  depositAmount: number;
  refundMethod: string;
  refundDate: string | null;
  status: "draft" | "sent" | "returned";
  revision: number;
  noticeSentAt: string | null;
  returnedAt: string | null;
  items: DamageItem[];
  evidence: DamageEvidence[];
};

export type ClubDamageHistory = {
  orderId: string;
  eventDate: string;
  clubs: string[];
  total: number;
  descriptions: string[];
  status: DepositSettlement["status"];
};

export type ClubDamageSummary = {
  key: string;
  name: string;
  incidentCount: number;
  associatedTotal: number;
  events: ClubDamageHistory[];
};

export function hostingClubKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}
