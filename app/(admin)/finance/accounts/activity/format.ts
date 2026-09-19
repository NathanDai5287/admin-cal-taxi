export function formatEntryDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US");
}
