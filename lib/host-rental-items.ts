import type { LineItem } from "@/components/host/LineItemList";

export function simplifyRentalLineItems(items: LineItem[]): LineItem[] {
  const simplified = items.map(item => {
    const description = item.description.split("—")[0].trim();
    return { ...item, description: description.toLowerCase() === "alcohol" ? "Alcohol surcharge" : description };
  });
  const protectionItems = simplified.filter(item => item.description.toLowerCase() === "property protection");
  if (!protectionItems.length) return simplified;
  const remaining = simplified.filter(item => !protectionItems.includes(item));
  const protectionAmount = protectionItems.reduce((total, item) => total + Number(item.amount), 0);
  const capacity = remaining.find(item => item.description.toLowerCase() === "capacity fee");
  if (capacity) {
    capacity.amount = (Number(capacity.amount) + protectionAmount).toFixed(2);
    return remaining;
  }
  const position = simplified.indexOf(protectionItems[0]);
  remaining.splice(position, 0, { description: "Capacity fee", amount: protectionAmount.toFixed(2) });
  return remaining;
}
