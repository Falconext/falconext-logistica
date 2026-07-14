// Formateo de moneda por empresa (espejo de apps/web/lib/currency.ts).
export type CurrencyCode = 'PEN' | 'USD' | 'EUR';

const CUR: Record<CurrencyCode, { symbol: string; locale: string }> = {
  PEN: { symbol: 'S/', locale: 'es-PE' },
  USD: { symbol: '$', locale: 'en-US' },
  EUR: { symbol: '€', locale: 'it-IT' },
};

export function normalizeCurrency(code?: string | null): CurrencyCode {
  const c = (code || '').toUpperCase();
  return c === 'PEN' || c === 'USD' || c === 'EUR' ? (c as CurrencyCode) : 'EUR';
}

export function formatMoney(amount?: number | string | null, currency?: string | null): string {
  const code = normalizeCurrency(currency);
  const { symbol, locale } = CUR[code];
  const value = typeof amount === 'string' ? parseFloat(amount) : amount ?? 0;
  const safe = Number.isFinite(value as number) ? (value as number) : 0;
  const formatted = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safe);
  return `${symbol} ${formatted}`;
}
