/** Compute per-unit tax in minor units. */
export function perUnitTax(
  unitPriceMinor: number,
  bps: number,
  inclusive: boolean,
): number {
  if (bps <= 0) return 0;
  if (inclusive) {
    // Price already includes tax: tax = price * bps / (10000 + bps)
    return Math.round((unitPriceMinor * bps) / (10_000 + bps));
  }
  // Exclusive: tax = price * bps / 10000
  return Math.round((unitPriceMinor * bps) / 10_000);
}
