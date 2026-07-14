'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

/**
 * DatePicker — reemplazo profesional del <input type="date"> nativo.
 * Controlado: value/onChange en formato ISO 'YYYY-MM-DD' (mismo contrato que
 * el input nativo), por lo que es un drop-in directo.
 *
 * Uso:
 *   <DatePicker label="Fecha" value={fecha} onChange={setFecha} />
 */

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

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
  placeholder = 'Seleccionar fecha',
  disabled = false,
  clearable = true,
  min,
  max,
  className = '',
}: DatePickerProps) {
  const selected = useMemo(() => parseISO(value), [value]);
  const minDate = useMemo(() => parseISO(min), [min]);
  const maxDate = useMemo(() => parseISO(max), [max]);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Date>(() => selected ?? new Date());
  const ref = useRef<HTMLDivElement>(null);

  // Al abrir, posicionar el calendario en el mes de la fecha seleccionada.
  useEffect(() => {
    if (open) setView(selected ?? new Date());
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cerrar al hacer clic fuera o con Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

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
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-slate-50 border text-sm text-left transition outline-none
            ${open ? 'border-slate-400 ring-2 ring-[#FFC933]/30' : 'border-slate-200 hover:border-slate-300'}
            ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <Calendar size={16} className="text-slate-400 shrink-0" />
          <span className={`flex-1 ${label_ ? 'text-slate-900' : 'text-slate-400'}`}>{label_ || placeholder}</span>
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

      {/* Popover calendario */}
      {open && (
        <div className="absolute z-50 mt-2 w-[280px] rounded-2xl border border-slate-200 bg-white shadow-xl p-3 animate-in fade-in zoom-in-95 duration-150">
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
              Hoy
            </button>
            {clearable && (
              <button type="button" onClick={() => { onChange(''); setOpen(false); }} className="text-xs font-medium text-slate-400 hover:text-red-500">
                Limpiar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
