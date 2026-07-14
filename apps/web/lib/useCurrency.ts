'use client';

import { useAuthStore } from './store';
import { formatMoney, normalizeCurrency, CurrencyCode } from './currency';

/**
 * Hook para formatear montos en la moneda de la empresa activa.
 * Uso:  const { format, currency } = useCurrency();  format(1234.5)
 */
export function useCurrency() {
  const user = useAuthStore((s) => s.user);
  const currency: CurrencyCode = normalizeCurrency(user?.moneda);
  return {
    currency,
    format: (amount?: number | string | null) => formatMoney(amount, currency),
  };
}
