'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, FileBarChart, Info } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/api';
import DatePicker from '../../components/DatePicker';
import { useT } from '../../lib/i18n';

interface ReporteMensualRow {
    fecha: string;
    conductor: string | null;
    vehiculo: string | null;
    origen: string | null;
    destino: string | null;
    compactada: 'Sí' | 'No';
    cliente: string | null;
    spedizione: string | null;
    km_facturado: number | null;
    ingreso: number | null;
    gastos: number;
}

// Primer y último día del mes en curso, en formato yyyy-mm-dd (para <input type="date">).
function defaultRange() {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return { from: iso(first), to: iso(last) };
}

export default function ReporteMensualModal({ onClose }: { onClose: () => void }) {
    const t = useT();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const [{ from, to }, setRange] = useState(defaultRange);
    const [loading, setLoading] = useState(false);

    const generar = async () => {
        setLoading(true);
        try {
            const res = await api.get<ReporteMensualRow[]>('/programacion/reporte-mensual', {
                params: { from: `${from}T00:00:00`, to: `${to}T23:59:59` },
            });
            const rows = res.data ?? [];
            if (rows.length === 0) return toast.error(t('operaciones.reporteMensual.toastSinDatos'));

            const xlsx = await import('xlsx');
            // t() solo devuelve strings (una clave por llamada) — no un objeto
            // completo. Pedir cada nombre de columna aparte, no el grupo entero.
            const c = {
                fecha: t('operaciones.reporteMensual.columnas.fecha'),
                conductor: t('operaciones.reporteMensual.columnas.conductor'),
                vehiculo: t('operaciones.reporteMensual.columnas.vehiculo'),
                origen: t('operaciones.reporteMensual.columnas.origen'),
                destino: t('operaciones.reporteMensual.columnas.destino'),
                compactada: t('operaciones.reporteMensual.columnas.compactada'),
                cliente: t('operaciones.reporteMensual.columnas.cliente'),
                spedizione: t('operaciones.reporteMensual.columnas.spedizione'),
                kmFacturado: t('operaciones.reporteMensual.columnas.kmFacturado'),
                ingreso: t('operaciones.reporteMensual.columnas.ingreso'),
                gastos: t('operaciones.reporteMensual.columnas.gastos'),
                neto: t('operaciones.reporteMensual.columnas.neto'),
            };
            const data = rows.map((r) => ({
                [c.fecha]: r.fecha ? new Date(r.fecha).toLocaleDateString() : '',
                [c.conductor]: r.conductor || '',
                [c.vehiculo]: r.vehiculo || '',
                [c.origen]: r.origen || '',
                [c.destino]: r.destino || '',
                [c.compactada]: r.compactada,
                [c.cliente]: r.cliente || '',
                [c.spedizione]: r.spedizione || '',
                [c.kmFacturado]: r.km_facturado ?? '',
                [c.ingreso]: r.ingreso ?? 0,
                [c.gastos]: r.gastos ?? 0,
                [c.neto]: (r.ingreso ?? 0) - (r.gastos ?? 0),
            }));
            // Fila de totales al final — suma directa en JS (evita fórmulas/locale de Excel).
            const totales = rows.reduce((acc, r) => ({ km: acc.km + (r.km_facturado || 0), ingreso: acc.ingreso + (r.ingreso || 0), gastos: acc.gastos + (r.gastos || 0) }), { km: 0, ingreso: 0, gastos: 0 });
            data.push({
                [c.fecha]: '', [c.conductor]: '', [c.vehiculo]: '', [c.origen]: '', [c.destino]: '',
                [c.compactada]: '', [c.cliente]: '', [c.spedizione]: t('operaciones.reporteMensual.total'),
                [c.kmFacturado]: Math.round(totales.km * 100) / 100,
                [c.ingreso]: Math.round(totales.ingreso * 100) / 100,
                [c.gastos]: Math.round(totales.gastos * 100) / 100,
                [c.neto]: Math.round((totales.ingreso - totales.gastos) * 100) / 100,
            });

            const ws = xlsx.utils.json_to_sheet(data);
            // Ancho de columna (en caracteres) — por defecto Excel las deja todas
            // iguales y angostas; aquí cada una según lo que realmente contiene.
            ws['!cols'] = [
                { wch: 12 }, // Fecha
                { wch: 22 }, // Conductor
                { wch: 12 }, // Vehículo
                { wch: 32 }, // Origen
                { wch: 32 }, // Destino
                { wch: 11 }, // Compactada
                { wch: 18 }, // Cliente
                { wch: 20 }, // Spedizione
                { wch: 13 }, // Km facturado
                { wch: 13 }, // Ingreso
                { wch: 13 }, // Gastos
                { wch: 13 }, // Neto
            ];
            const wb = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(wb, ws, t('operaciones.reporteMensual.hoja'));
            xlsx.writeFile(wb, `Reporte_Mensual_${from}_a_${to}.xlsx`);
            toast.success(t('operaciones.reporteMensual.toastGenerado'));
            onClose();
        } catch (error) {
            console.error(error);
            toast.error(t('operaciones.reporteMensual.toastError'));
        } finally {
            setLoading(false);
        }
    };

    if (!mounted) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="bg-white dark:bg-[#0F172A] rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md border border-slate-200/70 dark:border-slate-800 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-5 sm:p-6 border-b border-slate-200/70 dark:border-slate-800 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                            <FileBarChart size={18} />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('operaciones.reporteMensual.modalTitulo')}</h2>
                            <p className="text-xs text-slate-400 mt-1 leading-relaxed">{t('operaciones.reporteMensual.modalSubtitulo')}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition shrink-0">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-5 sm:p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <DatePicker label={t('operaciones.reporteMensual.fechaInicio')} value={from} onChange={(v) => setRange((r) => ({ ...r, from: v }))} />
                        <DatePicker label={t('operaciones.reporteMensual.fechaFin')} value={to} onChange={(v) => setRange((r) => ({ ...r, to: v }))} />
                    </div>

                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20">
                        <Info size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">{t('operaciones.reporteMensual.notaGastos')}</p>
                    </div>

                    <div className="flex gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors font-medium"
                        >
                            {t('operaciones.reporteMensual.cerrar')}
                        </button>
                        <button
                            type="button"
                            onClick={generar}
                            disabled={loading}
                            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold shadow-[0_8px_24px_rgba(15,23,42,0.18)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? t('operaciones.reporteMensual.generando') : t('operaciones.reporteMensual.generar')}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
