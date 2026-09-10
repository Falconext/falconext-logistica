'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import styles from './AutoScrollTable.module.css';
import { useT } from '../lib/i18n';

/**
 * Tabla con "autodesplazamiento" (portado de vendify-pos): contenedor con
 * scroll horizontal, botones ir-al-inicio / ir-al-final y un scrubber
 * sincronizado con la posición. La barra de controles vive al pie de la tabla
 * y, cuando ese pie queda por debajo del viewport, pasa a flotar fija abajo
 * (por portal, así no la recorta un card con overflow-hidden). Solo aparece si
 * la tabla realmente desborda.
 */
export default function AutoScrollTable({ children }: { children: React.ReactNode }) {
    const t = useT();
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const [hasOverflow, setHasOverflow] = useState(false);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [maxScroll, setMaxScroll] = useState(0);
    const [floatBar, setFloatBar] = useState<{ show: boolean; left: number; width: number }>({ show: false, left: 0, width: 0 });

    const jumpToEnd = () => {
        const el = tableContainerRef.current;
        if (!el) return;
        el.scrollTo({ left: Math.max(0, el.scrollWidth - el.clientWidth), behavior: 'smooth' });
    };
    const jumpToStart = () => tableContainerRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
    const setScroll = (left: number) => { if (tableContainerRef.current) tableContainerRef.current.scrollLeft = left; };

    const measure = useCallback(() => {
        const el = tableContainerRef.current;
        if (!el) return;
        setHasOverflow(el.scrollWidth > el.clientWidth + 1);
        setMaxScroll(Math.max(0, el.scrollWidth - el.clientWidth));
        setScrollLeft(el.scrollLeft);
    }, []);

    // La barra natural vive al pie de la tabla; si ese pie ya está dentro del
    // viewport no hace falta flotar. Flota mientras el pie esté por debajo.
    const updateFloat = useCallback(() => {
        const el = tableContainerRef.current;
        if (!el) return;
        const overflow = el.scrollWidth > el.clientWidth + 1;
        if (!overflow) { setFloatBar((s) => (s.show ? { ...s, show: false } : s)); return; }
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight;
        const tableInView = rect.top < vh && rect.bottom > 0;
        const naturalBarVisible = rect.bottom <= vh;
        setFloatBar({ show: tableInView && !naturalBarVisible, left: Math.max(0, rect.left), width: rect.width });
    }, []);

    useEffect(() => {
        measure();
        updateFloat();
        // capture:true → escucha el scroll de CUALQUIER contenedor (p. ej. <main>),
        // no solo el de window; así la barra sigue al desplazamiento vertical real.
        const onScrollOrResize = () => { measure(); updateFloat(); };
        window.addEventListener('scroll', onScrollOrResize, true);
        window.addEventListener('resize', onScrollOrResize);
        return () => {
            window.removeEventListener('scroll', onScrollOrResize, true);
            window.removeEventListener('resize', onScrollOrResize);
        };
    }, [children, measure, updateFloat]);

    useEffect(() => {
        if (!hasOverflow) tableContainerRef.current?.scrollTo({ left: 0, behavior: 'auto' });
    }, [hasOverflow]);

    const btn = 'shrink-0 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:shadow-sm transition';
    const controls = (floating: boolean) => (
        <div className={`flex items-center gap-2 px-4 py-2 ${floating ? 'rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg' : ''} bg-white/90 dark:bg-slate-900/90 backdrop-blur`}>
            <span className="hidden sm:inline text-xs text-slate-400 shrink-0">{t('componentes.autoScroll.titulo')}</span>
            <button type="button" onClick={jumpToStart} className={btn} title={t('componentes.autoScroll.inicio')}>
                <ChevronsLeft size={18} />
            </button>
            <input
                type="range"
                min={0}
                max={maxScroll || 0}
                value={Math.min(scrollLeft, maxScroll || 0)}
                onChange={(e) => setScroll(Number(e.target.value))}
                aria-label={t('componentes.autoScroll.aria')}
                className={`${styles.scrubber} flex-1 min-w-[80px]`}
            />
            <button type="button" onClick={jumpToEnd} className={btn} title={t('componentes.autoScroll.fin')}>
                <ChevronsRight size={18} />
            </button>
        </div>
    );

    return (
        <div className={styles.autoScrollTable}>
            <div ref={tableContainerRef} className={styles.tableContainer} onScroll={() => { if (tableContainerRef.current) setScrollLeft(tableContainerRef.current.scrollLeft); }}>
                {children}
            </div>
            {hasOverflow && !floatBar.show && <div className="border-t border-slate-100 dark:border-slate-800">{controls(false)}</div>}
            {hasOverflow && floatBar.show && createPortal(
                <div className="fixed z-40" style={{ bottom: 10, left: floatBar.left, width: floatBar.width }}>
                    {controls(true)}
                </div>,
                document.body,
            )}
        </div>
    );
}
