'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useT } from '../lib/i18n';

/**
 * DatePicker — reemplazo profesional del <input type="date"> nativo.
 * Controlado: value/onChange en formato ISO 'YYYY-MM-DD' (mismo contrato que
 * el input nativo), por lo que es un drop-in directo.
 *
 * Uso:
 *   <DatePicker label="Fecha" value={fecha} onChange={setFecha} />
 */

const pad = (n: number) => String(n).padStart(2, '0');
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Parsea 'YYYY-MM-DD' como fecha LOCAL (evita el desfase por zona horaria).
function parseISO(v?: string | null): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Índice de día de la semana con lunes = 0.
const mondayIndex = (d: Date) => (d.getDay() + 6) % 7;

interface DatePickerProps {
  value?: string | null;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  min?: string; // 'YYYY-MM-DD'
  max?: string; // 'YYYY-MM-DD'
  className?: string;
}

export default function DatePicker({
  value,
  onChange,
  label,
  placeholder,
  disabled = false,
  clearable = true,
  min,
  max,
  className = '',
}: DatePickerProps) {
  const t = useT();
  const MESES = useMemo(() => Array.from({ length: 12 }, (_, i) => t(`componentes.datePicker.m${i}`)), [t]);
  const MESES_CORTO = useMemo(() => Array.from({ length: 12 }, (_, i) => t(`componentes.datePicker.mc${i}`)), [t]);
  const DIAS = useMemo(() => Array.from({ length: 7 }, (_, i) => t(`componentes.datePicker.d${i}`)), [t]);
  const resolvedPlaceholder = placeholder ?? t('componentes.datePicker.placeholder');
  const selected = useMemo(() => parseISO(value), [value]);
  const minDate = useMemo(() => parseISO(min), [min]);
  const maxDate = useMemo(() => parseISO(max), [max]);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Date>(() => selected ?? new Date());
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // El calendario se renderiza en un portal a <body> (posición fixed) para
  // escapar de contenedores con overflow-hidden/scroll (p.ej. el modal y las
  // tarjetas de itinerario), que si no lo recortarían y no se vería.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const POP_W = 280;
  const POP_H = 340; // alto aprox. del popover para decidir arriba/abajo

  const computePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 8;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    // Abrir hacia abajo; si no cabe y sí cabe arriba, abrir hacia arriba.
    let top = r.bottom + gap;
    if (top + POP_H > vh && r.top - gap - POP_H > 0) top = r.top - gap - POP_H;
    // Alinear a la izquierda del trigger, sin salirse del viewport.
    let left = r.left;
    if (left + POP_W > vw - 8) left = vw - 8 - POP_W;
    if (left < 8) left = 8;
    setCoords({ top, left });
  };

  // Al abrir, posicionar el calendario en el mes de la fecha seleccionada y calcular coords.
  useEffect(() => {
    if (open) {
      setView(selected ?? new Date());
      computePosition();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cerrar al hacer clic fuera o con Escape; reposicionar en scroll/resize.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onReposition = () => computePosition();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const label_ = selected
    ? `${selected.getDate()} ${MESES_CORTO[selected.getMonth()]} ${selected.getFullYear()}`
    : '';

  // Rejilla de 42 celdas (6 semanas) para un layout estable.
  const cells = useMemo(() => {
    const y = view.getFullYear();
    const m = view.getMonth();
    const first = new Date(y, m, 1);
    const start = new Date(y, m, 1 - mondayIndex(first));
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return { date: d, inMonth: d.getMonth() === m };
    });
  }, [view]);

  const today = new Date();

  const isDisabledDay = (d: Date) => {
    if (minDate && d < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())) return true;
    if (maxDate && d > new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate())) return true;
    return false;
  };

  const pick = (d: Date) => {
    if (isDisabledDay(d)) return;
    onChange(toISO(d));
    setOpen(false);
  };

  const changeMonth = (delta: number) => setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));
  const goToday = () => {
    setView(new Date());
    pick(new Date());
  };

  return (
    <div className={`relative ${className}`} ref={ref}>
      {/* Estructura idéntica a los campos del formulario (label + space-y-1.5)
          para que el input y el DatePicker queden perfectamente alineados. */}
      <div className={label ? 'space-y-1.5' : ''}>
        {label && <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>}

        {/* Trigger */}
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-slate-50 border text-sm text-left transition outline-none
            ${open ? 'border-slate-400 ring-2 ring-[#FFC933]/30' : 'border-slate-200 hover:border-slate-300'}
            ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <Calendar size={16} className="text-slate-400 shrink-0" />
          <span className={`flex-1 ${label_ ? 'text-slate-900' : 'text-slate-400'}`}>{label_ || resolvedPlaceholder}</span>
          {clearable && label_ && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
              className="text-slate-300 hover:text-red-500 transition"
            >
              <X size={15} />
            </span>
          )}
        </button>
      </div>

      {/* Popover calendario — en portal a <body> con posición fixed para no ser
          recortado por contenedores con overflow (modal, tarjetas de itinerario). */}
      {open && mounted && createPortal(
        <div
          ref={popRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: POP_W }}
          className="z-[100] rounded-2xl border border-slate-200 bg-white shadow-xl p-3 animate-in fade-in zoom-in-95 duration-150">
          {/* Header mes/año */}
          <div className="flex items-center justify-between mb-2 px-1">
            <button type="button" onClick={() => changeMonth(-1)} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 transition">
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-semibold text-slate-900 capitalize">{MESES[view.getMonth()]} {view.getFullYear()}</span>
            <button type="button" onClick={() => changeMonth(1)} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 transition">
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Días de la semana */}
          <div className="grid grid-cols-7 mb-1">
            {DIAS.map((d) => (
              <div key={d} className="h-7 flex items-center justify-center text-[11px] font-semibold text-slate-400">{d}</div>
            ))}
          </div>

          {/* Rejilla de días */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map(({ date, inMonth }, i) => {
              const isSel = selected && sameDay(date, selected);
              const isToday = sameDay(date, today);
              const disabledDay = isDisabledDay(date);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabledDay}
                  onClick={() => pick(date)}
                  className={`h-9 rounded-lg text-sm font-medium transition
                    ${isSel ? 'bg-[#FFC933] text-[#1a1a1c] font-bold' : ''}
                    ${!isSel && isToday ? 'border border-[#FFC933] text-slate-900' : ''}
                    ${!isSel && !isToday && inMonth ? 'text-slate-700 hover:bg-slate-100' : ''}
                    ${!inMonth ? 'text-slate-300 hover:bg-slate-50' : ''}
                    ${disabledDay ? 'opacity-30 cursor-not-allowed hover:bg-transparent' : ''}`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          {/* Pie: hoy / limpiar */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 px-1">
            <button type="button" onClick={goToday} className="text-xs font-semibold text-[#1a1a1c] hover:underline">
              {t('componentes.datePicker.hoy')}
            </button>
            {clearable && (
              <button type="button" onClick={() => { onChange(''); setOpen(false); }} className="text-xs font-medium text-slate-400 hover:text-red-500">
                {t('componentes.datePicker.limpiar')}
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
