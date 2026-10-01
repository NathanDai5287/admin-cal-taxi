import { sharedStateFromSnapshot, type SharedState } from "./host-state-model";
import { effective, effectiveRentalPrice, liveBreakdown } from "./host-derive";
/** Whitelisted approved inputs. Browser navigation bookkeeping is never archived. */
export function orderSnapshot(data: SharedState): Record<string, unknown> {
  const clean = sharedStateFromSnapshot(data as unknown as Record<string, unknown>);
  const { currentOrderId, orderCreateRequestKey, loadedOrderIdentity, orderDraftIntent, lastDepositInvoiceNumber, ...terms } = clean;
  void currentOrderId; void orderCreateRequestKey; void loadedOrderIdentity; void orderDraftIntent; void lastDepositInvoiceNumber;
  return { ...terms, pricingBreakdown: liveBreakdown(clean), rentalPrice: effectiveRentalPrice(clean),
    depositAmount: effective(clean, "depositAmount"), maxGuests: effective(clean, "maxGuests") };
}
