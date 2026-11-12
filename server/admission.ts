/** Per-instance safety valve; edge rate limiting is required across instances. */
export function createAdmissionLimit(limit = 60, windowMs = 60_000, now = Date.now) {
  let start = now();
  let count = 0;
  return () => {
    const time = now();
    if (time < start || time - start >= windowMs) { start = time; count = 0; }
    if (count >= limit) return Math.max(1, Math.ceil((start + windowMs - time) / 1000));
    count++;
    return 0;
  };
}
