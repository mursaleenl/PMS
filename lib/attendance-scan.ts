/** Only office links from this workspace can enter the confirmation flow. */
export function attendanceScanPath(value: string, origin: string): string | null {
  try {
    const url = new URL(value.trim(), origin);
    if (url.origin !== origin || url.username || url.password || url.search || url.hash) return null;
    return /^\/work\/attendance\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i.test(url.pathname)
      ? url.pathname.replace(/\/$/, "") : null;
  } catch { return null; }
}
