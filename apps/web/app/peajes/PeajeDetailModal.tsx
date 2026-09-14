'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink, Paperclip, Link2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/api';
import OperacionPicker from './OperacionPicker';
import { useCurrency } from '../../lib/useCurrency';
import { useT, useDateLocale } from '../../lib/i18n';

// Sin límite guardado se muestra fecha + 14 días (regla de la empresa).
const sumarDiasIso = (iso?: string | null, dias = 14): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + dias);
    return d.toISOString();
};

interface PeajeDetailModalProps {
    item: any | null;
    onClose: () => void;
    // Supervisores/admin pueden vincular un peaje suelto a una operación desde
    // aquí. Al terminar se avisa al padre para que recargue la lista.
    canVincular?: boolean;
    onVinculado?: () => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
            <div className="text-sm text-slate-800">{children}</div>
        </div>
    );
}

export default function PeajeDetailModal({ item, onClose, canVincular = false, onVinculado }: PeajeDetailModalProps) {
    const t = useT();
    const [vincOpen, setVincOpen] = useState(false);
    const [vincOp, setVincOp] = useState('');
    const [vinculando, setVinculando] = useState(false);
    const esSuelto = !!item && item._origen !== 'operacion';
    const vincular = async () => {
        if (!item || !vincOp) return;
        setVinculando(true);
        try {
            await api.post(`/peajes/${item.id}/vincular`, { programacion_id: vincOp });
            toast.success(t('peajes.vincular.toastOk'));
            onVinculado?.();
            onClose();
        } catch (err: any) {
            toast.error(err?.response?.data?.message || t('peajes.vincular.toastError'));
        } finally {
            setVinculando(false);
        }
    };
    const dateLocale = useDateLocale();
    const { format } = useCurrency();
    // Portal a <body>: sin esto el modal queda acotado al <main overflow-y-auto>
    // del layout en vez de cubrir todo el viewport.
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!item || !mounted) return null;

    const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const fmtDateTime = (d?: string | null) => d ? new Date(d).toLocaleString(dateLocale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    const comprobantes: string[] = item.comprobantes?.length ? item.comprobantes : (item.archivo ? [item.archivo] : []);

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg border border-slate-200 shadow-2xl max-h-[92vh] overflow-y-auto animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-4 sm:p-6 border-b border-slate-200 flex justify-between items-center sticky top-0 bg-white/90 backdrop-blur-md z-10">
                    <h2 className="text-lg font-bold text-slate-900">{t('peajes.detalle.titulo')}</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-700 transition-colors">
                        <X size={22} />
                    </button>
                </div>

                <div className="p-4 sm:p-6 space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        <Field label={t('peajes.columnas.vehiculo')}>{item.targa || 'N/A'}</Field>
                        <Field label={t('peajes.columnas.estado')}>{item.estado || t('peajes.estados.pendiente')}</Field>
                        <Field label="Spedizione">{item.spedizione || '—'}</Field>
                        <Field label="Cliente">{item.cliente || '—'}</Field>
                        <Field label={t('peajes.columnas.fecha')}>{fmtDate(item.fecha)}</Field>
                        <Field label={t('peajes.detalle.fechaSubida')}>{fmtDateTime(item.creado_en)}</Field>
                        <Field label={t('peajes.detalle.fechaLimitePago')}>{fmtDate(item.fecha_limite_pago || sumarDiasIso(item.fecha, 14))}</Field>
                        <Field label={t('peajes.columnas.monto')}>{format(item.monto || 0)}</Field>
                        <Field label={t('peajes.detalle.pagadoPorChofer')}>{item.pagado_por_chofer === false ? t('peajes.detalle.no') : t('peajes.detalle.si')}</Field>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Field label={t('peajes.detalle.numeroMancato')}>{item.numero_mancato || item.id_multa || '—'}</Field>
                        <Field label={t('peajes.detalle.linkPago')}>
                            {item.link_peaje ? (
                                <a
                                    href={/^https?:\/\//i.test(item.link_peaje) ? item.link_peaje : `https://${item.link_peaje}`}
                                    target="_blank" rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 break-all"
                                    title={item.link_peaje}
                                >
                                    <ExternalLink size={13} className="shrink-0" /> {String(item.link_peaje).replace(/^https?:\/\//i, '').replace(/\/+$/, '')}
                                </a>
                            ) : '—'}
                        </Field>
                    </div>

                    {/* Vincular a operación: solo peajes sueltos y solo quien puede editar.
                        Un peaje de operación ya está vinculado (chip "Desde operación"). */}
                    {canVincular && esSuelto && (
                        <div className="rounded-xl border border-dashed border-blue-200 dark:border-blue-500/30 bg-blue-50/50 dark:bg-blue-500/5 p-3.5">
                            {!vincOpen ? (
                                <button
                                    onClick={() => setVincOpen(true)}
                                    className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300 hover:underline"
                                >
                                    <Link2 size={15} /> {t('peajes.vincular.boton')}
                                </button>
                            ) : (
                                <div className="space-y-3">
                                    <OperacionPicker
                                        value={vincOp}
                                        onChange={setVincOp}
                                        trabajadorId={item.trabajador_id || undefined}
                                        targa={item.targa || undefined}
                                        fecha={item.fecha ? new Date(item.fecha).toISOString().split('T')[0] : undefined}
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={() => { setVincOpen(false); setVincOp(''); }} disabled={vinculando}
                                            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition disabled:opacity-50">
                                            {t('peajes.cancelar')}
                                        </button>
                                        <button onClick={vincular} disabled={!vincOp || vinculando}
                                            className="flex-1 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2">
                                            {vinculando ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                                            {t('peajes.vincular.confirmar')}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {item.comentarios && (
                        <Field label={t('peajes.columnas.comentario')}>{item.comentarios}</Field>
                    )}

                    <div>
                        <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-1.5">{t('peajes.detalle.fotos')}</p>
                        {comprobantes.length === 0 ? (
                            <p className="text-sm text-slate-400">{t('peajes.detalle.sinFotos')}</p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {comprobantes.map((url, i) => (
                                    <a
                                        key={i}
                                        href={url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="w-20 h-20 rounded-lg border border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center hover:border-blue-300 transition shrink-0"
                                    >
                                        {/\.(pdf)$/i.test(url) ? (
                                            <Paperclip size={20} className="text-slate-400" />
                                        ) : (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={url} alt={`Comprobante ${i + 1}`} className="w-full h-full object-cover" />
                                        )}
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
