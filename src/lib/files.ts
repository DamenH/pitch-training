/** A filesystem-friendly name derived from a title. */
export function fileSafeName(title: string, fallback: string): string {
  return title.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 60) || fallback;
}

/** Save a blob through the browser's download flow. */
export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
