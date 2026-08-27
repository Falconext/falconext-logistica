'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink, Paperclip } from 'lucide-react';
import { useCurrency } from '../../lib/useCurrency';
import { useT, useDateLocale } from '../../lib/i18n';

interface PeajeDetailModalProps {
    item: any | null;
    onClose: () => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
            <div className="text-sm text-slate-800">{children}</div>
        </div>
    );
}

export default function PeajeDetailModal({ item, onClose }: PeajeDetailModalProps) {
    const t = useT();
    const dateLocale = useDateLocale();
    const { format } = useCurrency();
    // Portal a <body>: sin esto el modal queda acotado al <main overflow-y-auto>
    // del layout en vez de cubrir todo el viewport.
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!item || !mounted) return null;

    const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
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
                        <Field label={t('peajes.detalle.fechaLimitePago')}>{fmtDate(item.fecha_limite_pago)}</Field>
                        <Field label={t('peajes.columnas.monto')}>{format(item.monto || 0)}</Field>
                        <Field label={t('peajes.detalle.pagadoPorChofer')}>{item.pagado_por_chofer === false ? t('peajes.detalle.no') : t('peajes.detalle.si')}</Field>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Field label={t('peajes.detalle.numeroMancato')}>{item.numero_mancato || item.id_multa || '—'}</Field>
                        <Field label={t('peajes.detalle.linkPago')}>
                            {item.link_peaje ? (
                                <a href={item.link_peaje} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 break-all">
                                    <ExternalLink size={13} /> {t('peajes.detalle.abrirLink')}
                                </a>
                            ) : '—'}
                        </Field>
                    </div>

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
