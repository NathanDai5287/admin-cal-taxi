import { receiptFormat, receiptValidationError } from "./reimbursements/receipt-upload";

const LONG_EDGE = 1800;
const JPEG_QUALITY = 0.82;

async function browserReadable(file: File): Promise<Blob> {
  if (receiptFormat(file) !== "heic") return file;
  const { heicTo } = await import("heic-to/csp");
  return heicTo({ blob: file, type: "image/jpeg", quality: 0.9 });
}

export async function prepareHostingEvidence(file: File) {
  const validation = receiptValidationError(file);
  if (validation) throw new Error(validation.replace("Receipt", "Photo"));
  const readable = await browserReadable(file);
  const bitmap = await createImageBitmap(readable, { imageOrientation: "from-image" });
  const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error(`“${file.name}” could not be read.`);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob?.size) throw new Error(`“${file.name}” could not be converted to JPEG.`);
  return { blob, filename: file.name.replace(/\.[^.]+$/, "") + ".jpg" };
}
