// =============================================================================
// Theta Xi Rental Pricing Constants
// Edit these values to calibrate the pricing model.
// Hot-reload picks them up immediately during `next dev`.
// =============================================================================

export type AmountTier = { label: string; amount: number };
export type MultiplierTier = { label: string; multiplier: number };
export type RelationshipTier = {
  label: string;
  /** Discount/surcharge rate applied to the post-multiplier subtotal.
   *  > 0 = discount, 0 = no change, < 0 = surcharge. */
  r: number;
  /** Suggested deposit as a fraction of the total. Higher trust = lower
   *  collateral; known-issue groups get a hefty bump as both a damage
   *  cushion and a deterrent. */
  depositRate: number;
};

export type PricingConstants = {
  baseRate: number;
  capacityThreshold: number;
  perGuestRate: number;
  firePermitThreshold: number;
  firePermitAmount: number;
  alcoholTiers: AmountTier[];
  protectionTiers: AmountTier[];
  dateTiers: AmountTier[];
  setupTiers: AmountTier[];
  cleanupTiers: AmountTier[];
  wealthTiers: MultiplierTier[];
  // r > 0 = discount, r = 0 = no change, r < 0 = surcharge
  relationshipTiers: RelationshipTier[];
};

export const PRICING_CONSTANTS: PricingConstants = {
  baseRate: 150,

  capacityThreshold: 20,
  perGuestRate: 2,

  firePermitThreshold: 50,
  firePermitAmount: 125,

  alcoholTiers: [
    { label: "No alcohol",    amount: 0   },
    { label: "Beer & wine",   amount: 50  },
    { label: "Full open bar", amount: 100 },
  ],

  protectionTiers: [
    { label: "Very clean",      amount: 0   },
    { label: "Average",         amount: 50  },
    { label: "Messy",           amount: 150 },
    { label: "Disaster likely", amount: 300 },
  ],

  dateTiers: [
    { label: "Free anyway",          amount: 0   },
    { label: "Slight inconvenience", amount: 50  },
    { label: "Had plans",            amount: 125 },
    { label: "Holiday / major",      amount: 250 },
  ],

  setupTiers: [
    { label: "They handle it",  amount: 0   },
    { label: "Light setup",     amount: 25  },
    { label: "Full production", amount: 50 },
  ],

  cleanupTiers: [
    { label: "Basic", amount: 0 },
    { label: "Full",  amount: 200 },
  ],

  wealthTiers: [
    { label: "Budget-conscious", multiplier: 0.85 },
    { label: "Average",          multiplier: 1.00 },
    { label: "Well-funded",      multiplier: 1.25 },
    { label: "Corporate",        multiplier: 1.60 },
  ],

  relationshipTiers: [
    { label: "Known issues — messy, obnoxious, non-compliant", r: -0.75, depositRate: 0.50 },
    { label: "Strangers",        r:  0.00, depositRate: 0.25 },
    { label: "Acquaintance",     r:  0.05, depositRate: 0.20 },
    { label: "Friend of friend", r:  0.12, depositRate: 0.15 },
    { label: "Good friend",      r:  0.22, depositRate: 0.10 },
    { label: "Close family",     r:  0.35, depositRate: 0.05 },
  ],
};
