import { preparePhotoUpload } from "@/app/(admin)/nu-news/actions";
import { NU_NEWS_BUCKET, PHOTO_LONG_EDGE_PX } from "@/lib/nu-news/issue";
import { receiptFormat } from "@/lib/reimbursements/receipt-upload";

const JPEG_QUALITY = 0.82;

async function browserReadable(file: File): Promise<Blob> {
  if (receiptFormat(file) !== "heic") return file;
  const { heicTo } = await import("heic-to/csp");
  return heicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
}

async function shrunkJpeg(file: File) {
  const bitmap = await createImageBitmap(await browserReadable(file), { imageOrientation: "from-image" });
  const scale = Math.min(1, PHOTO_LONG_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
}

// The browser sends the photo straight to Storage: Vercel functions reject request bodies over 4.5 MB.
export async function uploadPhoto(issueId: string, file: File) {
  const jpeg = await shrunkJpeg(file).catch(() => null);
  if (!jpeg) throw new Error(`“${file.name}” could not be read. Choose a JPG, PNG, or HEIC photo.`);

  const target = await preparePhotoUpload(issueId);
  if (!target.ok) throw new Error(target.message);
  const url = new URL(`/storage/v1/object/upload/sign/${NU_NEWS_BUCKET}/${target.path}`, process.env.NEXT_PUBLIC_SUPABASE_URL);
  url.searchParams.set("token", target.token);
  const response = await fetch(url, { method: "PUT", body: jpeg, headers: { "content-type": "image/jpeg", "x-upsert": "false" } });
  if (!response.ok) throw new Error(`“${file.name}” did not upload. Try again.`);

  return { src: target.path, preview: URL.createObjectURL(jpeg) };
}
