'use client';

import { Languages } from 'lucide-react';
import { useI18n, LOCALES, type Locale } from '../lib/i18n';

const FLAG: Record<Locale, string> = { es: '🇪🇸', it: '🇮🇹' };

// Selector de idioma para el sidebar. Alterna entre los idiomas disponibles
// (es / it) y persiste la elección en cookie vía el provider.
export function LanguageSwitcher() {
    const { locale, setLocale, t } = useI18n();

    const next = LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length];

    return (
        <button
            onClick={() => setLocale(next)}
            className="w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm text-zinc-400 hover:bg-white/[0.06] hover:text-white transition-colors"
            title={t('lang.label')}
        >
            <Languages size={18} />
            <span className="flex-1 text-left">{t(`lang.${locale}`)}</span>
            <span className="text-base leading-none">{FLAG[locale]}</span>
        </button>
    );
}
