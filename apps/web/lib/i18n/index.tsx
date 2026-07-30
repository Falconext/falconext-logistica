'use client';

// Sistema de i18n ligero para la app (App Router, client-heavy).
//
// - Español por defecto. Italiano si el navegador está en italiano (it-*),
//   o si el usuario lo elige manualmente con el selector.
// - La elección se guarda en cookie `lang` (1 año) y se reutiliza en la
//   siguiente visita, por encima de la autodetección.
// - En SSR se renderiza siempre en español para evitar mismatch de hidratación;
//   el idioma real se resuelve en el primer efecto del cliente.

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import { DICTIONARIES, DEFAULT_LOCALE, type Dict, type Locale, LOCALES } from './dictionaries';

const COOKIE_KEY = 'lang';

/** Detecta el idioma preferido: cookie > idioma del navegador > español. */
function detectLocale(): Locale {
    if (typeof window === 'undefined') return DEFAULT_LOCALE;
    const saved = Cookies.get(COOKIE_KEY);
    if (saved && (LOCALES as string[]).includes(saved)) return saved as Locale;
    // navigator.languages cubre el orden de preferencia del usuario.
    const prefs = (navigator.languages && navigator.languages.length
        ? navigator.languages
        : [navigator.language]) || [];
    for (const l of prefs) {
        if (l && l.toLowerCase().startsWith('it')) return 'it';
        if (l && l.toLowerCase().startsWith('es')) return 'es';
    }
    return DEFAULT_LOCALE;
}

/** Resuelve una ruta con puntos ('nav.dashboard') dentro del diccionario. */
function resolve(dict: Dict, path: string): string | undefined {
    let node: any = dict;
    for (const part of path.split('.')) {
        if (node == null || typeof node !== 'object') return undefined;
        node = node[part];
    }
    return typeof node === 'string' ? node : undefined;
}

interface I18nContextValue {
    locale: Locale;
    setLocale: (l: Locale) => void;
    /** Traduce una clave con puntos. Interpola {name} con `vars`. */
    t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
    // SSR y primer render del cliente: español (coincide con el HTML servido).
    const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

    useEffect(() => {
        const detected = detectLocale();
        setLocaleState(detected);
    }, []);

    // Mantener el atributo <html lang> sincronizado para accesibilidad/SEO.
    useEffect(() => {
        if (typeof document !== 'undefined') {
            document.documentElement.lang = locale;
        }
    }, [locale]);

    const setLocale = useCallback((l: Locale) => {
        Cookies.set(COOKIE_KEY, l, { expires: 365 });
        setLocaleState(l);
    }, []);

    const t = useCallback(
        (key: string, vars?: Record<string, string | number>) => {
            const dict = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
            // Fallback a español si falta la clave en el idioma activo.
            const raw = resolve(dict, key) ?? resolve(DICTIONARIES[DEFAULT_LOCALE], key) ?? key;
            if (!vars) return raw;
            return raw.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
        },
        [locale]
    );

    return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
    const ctx = useContext(I18nContext);
    if (!ctx) throw new Error('useI18n debe usarse dentro de <I18nProvider>');
    return ctx;
}

/** Atajo: devuelve solo la función de traducción. */
export function useT() {
    return useI18n().t;
}

// Locale BCP-47 para APIs de formato nativas (toLocaleDateString/Intl), derivado
// del idioma activo. Así los nombres de mes/día siguen el idioma de la UI.
const DATE_LOCALE: Record<Locale, string> = { es: 'es-ES', it: 'it-IT' };

/** Devuelve el locale ('es-ES' | 'it-IT') para toLocaleDateString / Intl. */
export function useDateLocale(): string {
    return DATE_LOCALE[useI18n().locale] ?? DATE_LOCALE[DEFAULT_LOCALE];
}

export { LOCALES, DEFAULT_LOCALE } from './dictionaries';
export type { Locale } from './dictionaries';
