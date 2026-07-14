'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

/**
 * Select — reemplazo profesional y BUSCABLE del <select> nativo.
 * Controlado: value/onChange(value) (mismo contrato que el nativo pero
 * onChange recibe el value directo, no un evento).
 *
 * Uso:
 *   <Select label="Vehículo" value={v} onChange={setV}
 *     options={[{ value: '1', label: 'ABC-123' }, ...]} />
 */

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  value?: string | null;
  onChange: (value: string) => void;
  options: SelectOption[];
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  clearable?: boolean;
  className?: string;
}

export default function Select({
  value,
  onChange,
  options,
  label,
  placeholder = 'Seleccionar...',
  disabled = false,
  searchable = true,
  clearable = false,
  className = '',
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => options.find((o) => o.value === value) || null, [options, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Al abrir: limpiar búsqueda, enfocar, posicionar el activo en el seleccionado.
  useEffect(() => {
    if (open) {
      setQuery('');
      const idx = filtered.findIndex((o) => o.value === value);
      setActive(idx >= 0 ? idx : 0);
      if (searchable) setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cerrar al hacer clic fuera.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Mantener el ítem activo visible al navegar con teclado.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const pick = (opt: SelectOption) => {
    if (opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[active];
      if (opt) pick(opt);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className={`relative ${className}`} ref={ref}>
      {/* Estructura idéntica a los campos del formulario para alinear con inputs vecinos. */}
      <div className={label ? 'space-y-1.5' : ''}>
        {label && <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>}

        {/* Trigger */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className={`w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-50 border text-sm text-left transition outline-none
            ${open ? 'border-slate-400 ring-2 ring-[#FFC933]/30' : 'border-slate-200 hover:border-slate-300'}
            ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <span className={`flex-1 truncate ${selected ? 'text-slate-900' : 'text-slate-400'}`}>
            {selected ? selected.label : placeholder}
          </span>
          {clearable && selected && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
              className="text-slate-300 hover:text-red-500 transition"
            >
              <X size={15} />
            </span>
          )}
          <ChevronDown size={16} className={`text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Popover */}
      {open && (
        <div className="absolute z-50 mt-2 w-full rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {searchable && (
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100">
              <Search size={15} className="text-slate-400 shrink-0" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                onKeyDown={onKeyDown}
                placeholder="Buscar..."
                className="w-full bg-transparent outline-none text-sm text-slate-900 placeholder:text-slate-400"
              />
            </div>
          )}

          <div ref={listRef} className="max-h-60 overflow-y-auto p-1.5" onKeyDown={onKeyDown} tabIndex={-1}>
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-slate-400">Sin resultados</div>
            ) : (
              filtered.map((opt, i) => {
                const isSel = opt.value === value;
                const isActive = i === active;
                return (
                  <button
                    key={opt.value + i}
                    type="button"
                    disabled={opt.disabled}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(opt)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition
                      ${isSel ? 'font-semibold text-[#1a1a1c]' : 'text-slate-700'}
                      ${isActive && !opt.disabled ? 'bg-slate-100' : ''}
                      ${opt.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span className="flex-1 truncate">{opt.label}</span>
                    {isSel && <Check size={16} className="text-[#F5A623] shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
