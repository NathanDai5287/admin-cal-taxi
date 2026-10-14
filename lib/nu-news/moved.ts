export function moved<Item>(items: Item[], index: number, offset: number) {
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(index + offset, 0, item);
  return next;
}
