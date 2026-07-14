// Utilidades de moneda multi-divisa (PEN / USD / EUR).
// La moneda base la define la empresa (tenant.moneda) y llega en el login
// dentro de user.moneda. Todos los montos se formatean con formatMoney.

export type CurrencyCode = 'PEN' | 'USD' | 'EUR';

export const CURRENCIES: Record<CurrencyCode, { symbol: string; label: string; locale: string }> = {
  PEN: { symbol: 'S/', label: 'Sol peruano', locale: 'es-PE' },
  USD: { symbol: '$', label: 'Dólar', locale: 'en-US' },
  EUR: { symbol: '€', label: 'Euro', locale: 'it-IT' },
};

export const DEFAULT_CURRENCY: CurrencyCode = 'EUR';

export function normalizeCurrency(code?: string | null): CurrencyCode {
  const c = (code || '').toUpperCase();
  return c === 'PEN' || c === 'USD' || c === 'EUR' ? (c as CurrencyCode) : DEFAULT_CURRENCY;
}

/**
 * Formatea un monto en la moneda indicada, p.ej.:
 *  formatMoney(1234.5, 'PEN') -> 'S/ 1,234.50'
 *  formatMoney(1234.5, 'EUR') -> '€ 1.234,50'
 */
export function formatMoney(amount?: number | string | null, currency?: string | null): string {
  const code = normalizeCurrency(currency);
  const { symbol, locale } = CURRENCIES[code];
  const value = typeof amount === 'string' ? parseFloat(amount) : amount ?? 0;
  const safe = Number.isFinite(value as number) ? (value as number) : 0;
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
  return `${symbol} ${formatted}`;
}
