const DEFAULT_OBJECT_URL_REVOKE_DELAY_MS = 30_000;

export function saveBlobDownload(
  blob: Blob,
  fileName: string,
  revokeDelayMs = DEFAULT_OBJECT_URL_REVOKE_DELAY_MS,
): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), revokeDelayMs);
}
