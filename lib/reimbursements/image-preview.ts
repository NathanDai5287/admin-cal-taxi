type ObjectUrlApi = Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;

export function replaceImagePreviewUrl(
  currentUrl: string,
  image?: Blob,
  objectUrlApi: ObjectUrlApi = URL,
) {
  if (currentUrl) objectUrlApi.revokeObjectURL(currentUrl);
  return image ? objectUrlApi.createObjectURL(image) : "";
}
