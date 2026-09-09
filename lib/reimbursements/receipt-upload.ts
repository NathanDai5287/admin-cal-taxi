export const maxReceiptSize = 10 * 1024 * 1024;
export const receiptAccept = "image/jpeg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif";

export function receiptFormat(file: Pick<File, "type" | "name">): "jpg" | "png" | "heic" | null {
  if (/^image\/hei[cf](?:-sequence)?$/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) return "heic";
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  // Some browsers provide no MIME type for files dragged from the desktop.
  if (!file.type || file.type === "application/octet-stream") {
    if (/\.jpe?g$/i.test(file.name)) return "jpg";
    if (/\.png$/i.test(file.name)) return "png";
  }
  return null;
}

export function receiptValidationError(file: File): string | null {
  if (!receiptFormat(file)) return "Receipt must be a JPG, PNG, or HEIC image.";
  if (file.size === 0 || file.size > maxReceiptSize) return "Choose a non-empty receipt image up to 10 MB.";
  return null;
}

export async function prepareReceiptImage(file: File): Promise<{ blob: Blob; extension: "jpg" | "png" }> {
  const error = receiptValidationError(file);
  if (error) throw new Error(error);
  const format = receiptFormat(file)!;
  if (format !== "heic") {
    return { blob: file.slice(0, file.size, format === "jpg" ? "image/jpeg" : "image/png"), extension: format };
  }

  let blob: Blob;
  try {
    // Load the browser-only decoder only when needed. Store a real JPEG so all
    // existing receipt viewers, OCR, and Discord consumers use the same image.
    const { heicTo } = await import("heic-to/csp");
    blob = await heicTo({ blob: file, type: "image/jpeg", quality: 0.9 });
  } catch {
    throw new Error("This HEIC image could not be converted. Try another photo or export it as JPG or PNG.");
  }
  if (!blob.size || blob.type !== "image/jpeg") {
    throw new Error("HEIC conversion did not produce a valid receipt. Try exporting the photo as JPG.");
  }
  if (blob.size > maxReceiptSize) {
    throw new Error("The converted receipt exceeds 10 MB. Choose a smaller photo or export a smaller JPG.");
  }
  return { blob, extension: "jpg" };
}
