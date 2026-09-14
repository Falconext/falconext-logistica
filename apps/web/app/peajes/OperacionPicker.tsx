'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link2, Package } from 'lucide-react';
import api from '../../lib/api';
import Select from '../../components/Select';
import { useDateLocale, useT } from '../../lib/i18n';

// Selector "Vincular a operación" para el módulo de Peajes. Pide al backend las
// operaciones recientes acotadas por chofer/placa/fecha del peaje (así el
// supervisor encuentra el viaje sin ir a buscarlo a Operaciones) y devuelve el
// id elegido. Es opcional: si queda vacío el peaje se registra suelto como antes.
interface OperacionCandidata {
    id: string;
    fecha: string;
    cliente: string | null;
    lugar_entrega: string | null;
    vehiculo_id: string | null;
    trabajador_id: string | null;
    trabajador_nombre: string | null;
    spedizione: string | null;
    estado_consegna: string | null;
}

export default function OperacionPicker({
    value, onChange, trabajadorId, targa, fecha, className = '', required = false,
}: {
    value: string;
    onChange: (id: string) => void;
    trabajadorId?: string;
    targa?: string;
    fecha?: string;
    className?: string;
    // Chofer: el peaje DEBE ir a una de sus consegnas (no puede quedar suelto).
    required?: boolean;
}) {
    const t = useT();
    const dateLocale = useDateLocale();
    const [ops, setOps] = useState<OperacionCandidata[]>([]);
    const [loading, setLoading] = useState(false);

    // Se recarga cuando cambian los filtros (chofer/placa/fecha del formulario),
    // así la lista se va acotando mientras el supervisor llena el peaje.
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        api.get('/peajes/operaciones-candidatas', {
            params: { trabajadorId: trabajadorId || undefined, targa: targa || undefined, fecha: fecha || undefined, take: 40 },
        })
            .then((res) => { if (!cancelled) setOps(Array.isArray(res.data) ? res.data : []); })
            .catch(() => { if (!cancelled) setOps([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [trabajadorId, targa, fecha]);

    const options = useMemo(() => ops.map((o) => {
        const f = o.fecha ? new Date(o.fecha).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short' }) : '';
        const quien = [o.trabajador_nombre, o.vehiculo_id].filter(Boolean).join(' · ');
        return {
            value: o.id,
            label: `${f} · ${o.cliente || o.lugar_entrega || t('peajes.vincular.sinCliente')}${quien ? ` · ${quien}` : ''}`,
        };
    }), [ops, dateLocale, t]);

    return (
        <div className={`space-y-2 ${className}`}>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Link2 size={14} className="text-blue-500" />
                {t('peajes.vincular.label')}
                {required
                    ? <span className="text-xs font-semibold text-rose-500">*</span>
                    : <span className="text-xs font-normal text-slate-400">({t('peajes.vincular.opcional')})</span>}
            </label>
            <Select
                value={value}
                onChange={onChange}
                options={options}
                placeholder={loading ? t('peajes.vincular.cargando') : ops.length ? t('peajes.vincular.placeholder') : t('peajes.vincular.sinResultados')}
                clearable
            />
            <p className="text-[11px] text-slate-400 leading-relaxed flex items-start gap-1.5">
                <Package size={12} className="mt-0.5 shrink-0" />
                {required ? t('peajes.vincular.ayudaChofer') : t('peajes.vincular.ayuda')}
            </p>
        </div>
    );
}
