"use client";

export const SUPPORTED_CURRENCIES = ["USD", "INR", "EUR", "GBP", "AED", "AUD", "CAD"] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

export const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
  USD: 1.0,
  INR: 95.2, // Offline estimate; refreshed rates are preferred.
  EUR: 0.92,
  GBP: 0.79,
  AED: 3.67,
  CAD: 1.38,
  AUD: 1.52,
};

const RATES_STORAGE_KEY = "evecture.currency.rates.v1";
const RATES_TIMESTAMP_KEY = "evecture.currency.rates_updated_at";

let cachedRates: Record<string, number> = { ...DEFAULT_EXCHANGE_RATES };

export function getExchangeRates(): Record<string, number> {
  if (typeof window === "undefined") return { ...DEFAULT_EXCHANGE_RATES };
  try {
    const raw = localStorage.getItem(RATES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.USD === 1) {
        const valid = Object.fromEntries(Object.entries(parsed).filter(([code,rate]) => /^[A-Z]{3}$/.test(code) && typeof rate === "number" && Number.isFinite(rate) && rate > 0).map(([code,rate]) => [code,rate as number]));
        cachedRates = { ...DEFAULT_EXCHANGE_RATES, ...valid };
        return cachedRates;
      }
    }
  } catch {
    // ignore
  }
  return cachedRates;
}

export function saveExchangeRates(rates: Record<string, number>) {
  cachedRates = { ...DEFAULT_EXCHANGE_RATES, ...rates };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(cachedRates));
      localStorage.setItem(RATES_TIMESTAMP_KEY, new Date().toISOString());
      window.dispatchEvent(new CustomEvent("evecture:exchange-rates-updated", { detail: cachedRates }));
    } catch {
      // ignore
    }
  }
}

/**
 * Fetch latest exchange rates against USD in background.
 * Falls back silently to defaults on failure.
 */
export async function refreshExchangeRates(): Promise<Record<string, number>> {
  if (typeof window === "undefined") return cachedRates;

  // Hydrate the cache before honoring its persisted timestamp.
  getExchangeRates();
  // Cache for 1 hour
  try {
    const lastUpdated = localStorage.getItem(RATES_TIMESTAMP_KEY);
    if (lastUpdated) {
      const diffMinutes = (Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60);
      if (diffMinutes >= 0 && diffMinutes < 60 && cachedRates.INR) {
        return cachedRates;
      }
    }
  } catch {
    // proceed to fetch
  }

  try {
    const response = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!response.ok) return getExchangeRates();
    const data = await response.json();
    if (data?.result === "success" && data.rates && typeof data.rates === "object") {
      const newRates: Record<string, number> = {
        USD: 1.0,
        INR: Number(data.rates.INR) || DEFAULT_EXCHANGE_RATES.INR,
        EUR: Number(data.rates.EUR) || DEFAULT_EXCHANGE_RATES.EUR,
        GBP: Number(data.rates.GBP) || DEFAULT_EXCHANGE_RATES.GBP,
        AED: Number(data.rates.AED) || DEFAULT_EXCHANGE_RATES.AED,
        CAD: Number(data.rates.CAD) || DEFAULT_EXCHANGE_RATES.CAD,
        AUD: Number(data.rates.AUD) || DEFAULT_EXCHANGE_RATES.AUD,
      };
      saveExchangeRates(newRates);
      return newRates;
    }
  } catch {
    // network failure / offline: retain cached or defaults
  }
  return getExchangeRates();
}

/**
 * Convert an amount from one currency to another using the provided or cached exchange rates.
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number> = getExchangeRates()
): number {
  if (!Number.isFinite(amount) || amount === 0) return 0;
  const from = (fromCurrency || "USD").toUpperCase();
  const to = (toCurrency || "USD").toUpperCase();

  if (from === to) return amount;

  const fromRate = rates[from] ?? DEFAULT_EXCHANGE_RATES[from];
  const toRate = rates[to] ?? DEFAULT_EXCHANGE_RATES[to];
  if (!Number.isFinite(fromRate) || fromRate <= 0 || !Number.isFinite(toRate) || toRate <= 0) return Number.NaN;

  // First convert from original currency to USD base
  const amountInUsd = amount / fromRate;

  // Then convert from USD to target currency
  return amountInUsd * toRate;
}

export function formatMoney(amount: number, currency = "USD"): string {
  const cleanCurrency = (currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: cleanCurrency,
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${cleanCurrency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}
