type ClipboardItem = Pick<DataTransferItem, "getAsFile" | "kind" | "type">;

export function clipboardImage(items: Iterable<ClipboardItem>) {
  for (const item of items) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    return item.getAsFile();
  }

  return null;
}
