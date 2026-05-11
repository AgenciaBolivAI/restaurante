import { dinero, toDecimal, add, multiply, type Dinero } from "dinero.js";
import * as currencies from "@dinero.js/currencies";

type CurrencyCode = keyof typeof currencies;

function getCurrency(code: string) {
  const upper = code.toUpperCase() as CurrencyCode;
  const c = currencies[upper];
  if (!c) throw new Error(`Unknown currency: ${code}`);
  return c as (typeof currencies)["USD"];
}

export function money(amountMinor: number, currency: string): Dinero<number> {
  return dinero({ amount: amountMinor, currency: getCurrency(currency) });
}

export function formatMoney(
  amountMinor: number,
  currency: string,
  locale = "es",
): string {
  const value = toDecimal(money(amountMinor, currency));
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(Number(value));
}

export function sumMinor(amounts: number[]): number {
  return amounts.reduce((acc, n) => acc + n, 0);
}

/** Apply tax in basis points (1000 = 10%). Returns tax amount in minor units. */
export function taxFromBps(subtotalMinor: number, bps: number): number {
  return Math.round((subtotalMinor * bps) / 10_000);
}

export { add, multiply, toDecimal };
