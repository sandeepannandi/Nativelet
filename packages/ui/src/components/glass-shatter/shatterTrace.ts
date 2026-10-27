/** Existing Worklets ATrace globals only. Never silently accept missing markers. */
export function traceShatterSection<T>(enabled: boolean, name: string, body: () => T): T {
  "worklet";
  if (!enabled) return body();
  const g = globalThis as typeof globalThis & {
    _beginSection?: (name: string) => void;
    _endSection?: () => void;
  };
  if (typeof g._beginSection !== "function" || typeof g._endSection !== "function") {
    throw new Error("SHATTER_TRACE_UNAVAILABLE: diagnostic marker gate failed");
  }
  // Synchronous body only. Never span callbacks/threads with this pair.
  g._beginSection(name);
  try {
    return body();
  } finally {
    g._endSection();
  }
}
