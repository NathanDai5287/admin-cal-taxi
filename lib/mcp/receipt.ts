import { Buffer } from "node:buffer";

const receiptDataUrl = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/;
const maxMcpReceiptSize = 10 * 1024 * 1024;

export type McpReceipt = {
  bytes: Buffer;
  contentType: "image/jpeg" | "image/png";
  extension: "jpg" | "png";
};

export function decodeMcpReceipt(value: string): McpReceipt {
  const match = receiptDataUrl.exec(value);
  if (!match) throw new Error("The receipt must be a JPG or PNG data URL.");

  const contentType = match[1] as McpReceipt["contentType"];
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > maxMcpReceiptSize) {
    throw new Error("The receipt must be a non-empty image up to 10 MB.");
  }

  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if ((contentType === "image/jpeg" && !isJpeg) || (contentType === "image/png" && !isPng)) {
    throw new Error("The receipt data does not match its image type.");
  }

  return { bytes, contentType, extension: contentType === "image/jpeg" ? "jpg" : "png" };
}
